import { readFileSync } from 'node:fs';
import { z } from 'zod';

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export type JsonObject = { readonly [key: string]: JsonValue };

type OrderedEntry = {
  readonly order: number;
  readonly payload: JsonObject;
};

const JSON_VALUE_SCHEMA: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(JSON_VALUE_SCHEMA),
    z.record(z.string(), JSON_VALUE_SCHEMA),
  ]),
);

const TYPE_REFERENCE_SCHEMA = z.object({
  base: z.string().min(1),
  nullable: z.boolean(),
  isList: z.boolean(),
  listItemNullable: z.boolean().optional(),
});

const ARGUMENT_SCHEMA = z.object({
  name: z.string().min(1),
  type: TYPE_REFERENCE_SCHEMA,
  directives: z.record(z.string(), JSON_VALUE_SCHEMA),
});

const FIELD_SCHEMA = z.object({
  name: z.string().min(1),
  type: TYPE_REFERENCE_SCHEMA,
  arguments: z.array(ARGUMENT_SCHEMA).default([]),
  directives: z.record(z.string(), JSON_VALUE_SCHEMA),
});

const LOWERED_TYPE_SCHEMA = z.object({
  name: z.string().min(1),
  kind: z.string().min(1),
  directives: z.record(z.string(), JSON_VALUE_SCHEMA),
  fields: z.array(FIELD_SCHEMA).default([]),
  enumValues: z.array(z.string()).optional(),
});

const LOWERED_SCHEMA = z.object({
  version: z.string().min(1),
  types: z.array(LOWERED_TYPE_SCHEMA),
});

const REGISTRY_SCHEMA = z.object({
  version: z.literal('git-warp.capabilities/v19'),
  moduleSummary: z.string().min(1),
  sdkSummary: z.string().min(1),
  formalIdentifiers: z.array(z.string().min(1)),
  exceptionPaths: z.array(z.string().min(1)),
});

export const NOUN_SCHEMA = z.object({
  name: z.string().min(1),
  summary: z.string().min(1),
});

const CAPABILITY_SCHEMA = z.object({
  cliOrder: z.number().int().positive().optional(),
  cliCommand: z.string().min(1).optional(),
  cliSummary: z.string().min(1).optional(),
  cliUsage: z.string().min(1).optional(),
  mcpOrder: z.number().int().positive().optional(),
  mcpName: z.string().regex(/^warp_[a-z_]+$/u).optional(),
  mcpDescription: z.string().min(1).optional(),
});

const FORBIDDEN_SCHEMA = z.object({
  phrase: z.string().min(1),
  scopes: z.array(z.enum(['ROOT_DECLARATION', 'PUBLIC_SURFACE'])).min(1),
});

const RANGE_SCHEMA = z.object({
  minimum: z.number().int(),
  maximum: z.number().int(),
});

const ONE_OF_SCHEMA = z.object({
  values: z.array(z.string().min(1)).min(1),
});

export class CapabilityContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapabilityContractError';
  }
}

function requiredType(
  types: z.infer<typeof LOWERED_TYPE_SCHEMA>[],
  name: string,
): z.infer<typeof LOWERED_TYPE_SCHEMA> {
  const found = types.find((type) => type.name === name);
  if (found === undefined) {
    throw new CapabilityContractError(`Wesley IR is missing ${name}`);
  }
  return found;
}

function requiredMetadata<T>(
  value: T | undefined,
  field: string,
  metadata: string,
): T {
  if (value === undefined) {
    throw new CapabilityContractError(
      `${field} is missing required ${metadata} metadata`,
    );
  }
  return value;
}

function argumentJsonSchema(
  argument: z.infer<typeof ARGUMENT_SCHEMA>,
): JsonObject {
  if (argument.type.base === 'JsonObject') {
    return { type: 'object' };
  }
  if (argument.type.base === 'String') {
    const oneOf = argument.directives['oneOf'];
    if (oneOf !== undefined) {
      return {
        type: 'string',
        enum: ONE_OF_SCHEMA.parse(oneOf).values,
      };
    }
    return { type: 'string', minLength: 1 };
  }
  if (argument.type.base === 'Int') {
    const range = argument.directives['range'];
    if (range === undefined) {
      return { type: 'integer' };
    }
    const bounds = RANGE_SCHEMA.parse(range);
    return {
      type: 'integer',
      minimum: bounds.minimum,
      maximum: bounds.maximum,
    };
  }
  throw new CapabilityContractError(
    `${argument.name} uses unsupported MCP input type ${argument.type.base}`,
  );
}

function mcpInputSchema(
  field: z.infer<typeof FIELD_SCHEMA>,
): JsonObject {
  const properties = Object.fromEntries(
    field.arguments.map((argument) => [
      argument.name,
      argumentJsonSchema(argument),
    ]),
  );
  return {
    type: 'object',
    properties,
    required: field.arguments
      .filter((argument) => !argument.type.nullable)
      .map((argument) => argument.name),
    additionalProperties: false,
  };
}

function orderedCli(
  field: z.infer<typeof FIELD_SCHEMA>,
): OrderedEntry | null {
  const metadata = CAPABILITY_SCHEMA.parse(field.directives['capability']);
  if (metadata.cliOrder === undefined) {
    return null;
  }
  return {
    order: metadata.cliOrder,
    payload: {
      command: requiredMetadata(
        metadata.cliCommand,
        field.name,
        'cliCommand',
      ),
      summary: requiredMetadata(
        metadata.cliSummary,
        field.name,
        'cliSummary',
      ),
      usage: requiredMetadata(metadata.cliUsage, field.name, 'cliUsage'),
    },
  };
}

function orderedMcp(
  field: z.infer<typeof FIELD_SCHEMA>,
): OrderedEntry | null {
  const metadata = CAPABILITY_SCHEMA.parse(field.directives['capability']);
  if (metadata.mcpOrder === undefined) {
    return null;
  }
  return {
    order: metadata.mcpOrder,
    payload: {
      name: requiredMetadata(metadata.mcpName, field.name, 'mcpName'),
      description: requiredMetadata(
        metadata.mcpDescription,
        field.name,
        'mcpDescription',
      ),
      inputSchema: mcpInputSchema(field),
    },
  };
}

function orderedEntries(
  fields: z.infer<typeof FIELD_SCHEMA>[],
  project: (field: z.infer<typeof FIELD_SCHEMA>) => OrderedEntry | null,
  kind: string,
): JsonObject[] {
  const entries = fields.flatMap((field) => {
    const entry = project(field);
    return entry === null ? [] : [entry];
  });
  entries.sort((left, right) => left.order - right.order);
  return entries.map((entry, index) => {
    if (entry.order !== index + 1) {
      throw new CapabilityContractError(
        `${kind} order must be contiguous from one`,
      );
    }
    return entry.payload;
  });
}

function requireUnique(
  entries: JsonObject[],
  field: 'command' | 'name',
): void {
  const values = entries.map((entry) =>
    z.string().parse(entry[field])
  );
  const duplicates = values.filter(
    (value, index) => values.indexOf(value) !== index,
  );
  if (duplicates.length > 0) {
    throw new CapabilityContractError(
      `${field} values must be unique: ${[...new Set(duplicates)].join(', ')}`,
    );
  }
}

export function readV19VocabularyContract(irPath: string): JsonObject {
  const lowered = LOWERED_SCHEMA.parse(
    JSON.parse(readFileSync(irPath, 'utf8')),
  );
  const vocabulary = requiredType(lowered.types, 'PublicVocabulary');
  const registry = REGISTRY_SCHEMA.parse(vocabulary.directives['registry']);
  const capabilities = requiredType(lowered.types, 'PublicCapabilities');
  const rejected = requiredType(lowered.types, 'RejectedVocabulary');
  const cli = orderedEntries(capabilities.fields, orderedCli, 'CLI');
  const mcp = orderedEntries(capabilities.fields, orderedMcp, 'MCP');
  requireUnique(cli, 'command');
  requireUnique(mcp, 'name');
  return {
    version: registry.version,
    moduleSummary: registry.moduleSummary,
    sdkSummary: registry.sdkSummary,
    formalIdentifiers: registry.formalIdentifiers,
    exceptionPaths: registry.exceptionPaths,
    nouns: vocabulary.fields.map((field) =>
      NOUN_SCHEMA.parse(field.directives['noun'])
    ),
    forbiddenTerms: rejected.fields.map((field) =>
      FORBIDDEN_SCHEMA.parse(field.directives['forbidden'])
    ),
    cli,
    mcp,
  };
}
