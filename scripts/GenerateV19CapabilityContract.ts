import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIRECTORY, '..');
const SOURCE_PATH = resolve(
  ROOT,
  'bin/cli/capabilities/v19-capabilities.json',
);
const OUTPUT_PATH = resolve(
  ROOT,
  'bin/cli/capabilities/V19CapabilityContract.generated.ts',
);

const JSON_VALUE_SCHEMA: z.ZodType<
  null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue }
> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(JSON_VALUE_SCHEMA),
    z.record(z.string(), JSON_VALUE_SCHEMA),
  ]),
);

type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

const CONTRACT_SCHEMA = z.object({
  version: z.literal('git-warp.capabilities/v19'),
  cli: z.array(z.object({
    command: z.string().min(1),
    summary: z.string().min(1),
    usage: z.string().min(1),
  })).min(1),
  mcp: z.array(z.object({
    name: z.string().regex(/^warp_[a-z_]+$/u),
    description: z.string().min(1),
    inputSchema: z.record(z.string(), JSON_VALUE_SCHEMA),
  })).min(1),
});

class CapabilityContractDriftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CapabilityContractDriftError';
  }
}

function renderContract(): string {
  const source = CONTRACT_SCHEMA.parse(
    JSON.parse(readFileSync(SOURCE_PATH, 'utf8')),
  );
  requireUnique(source.cli.map((entry) => entry.command), 'CLI command');
  requireUnique(source.mcp.map((entry) => entry.name), 'MCP tool');
  return [
    '/* @generated from v19-capabilities.json. Do not edit by hand. */',
    '',
    `export const V19_CAPABILITY_CONTRACT = ${JSON.stringify(source, null, 2)} as const;`,
    '',
  ].join('\n');
}

function requireUnique(values: readonly string[], kind: string): void {
  const duplicates = values.filter(
    (value, index) => values.indexOf(value) !== index,
  );
  if (duplicates.length > 0) {
    throw new CapabilityContractDriftError(
      `${kind} names must be unique: ${[...new Set(duplicates)].join(', ')}`,
    );
  }
}

const rendered = renderContract();
if (process.argv.includes('--check')) {
  const current = readFileSync(OUTPUT_PATH, 'utf8');
  if (current !== rendered) {
    throw new CapabilityContractDriftError(
      'v19 capability contract drifted; run npm run generate:capabilities',
    );
  }
} else {
  writeFileSync(OUTPUT_PATH, rendered);
}
