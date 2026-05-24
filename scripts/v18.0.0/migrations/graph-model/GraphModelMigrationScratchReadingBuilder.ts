import GenesisEquivalenceBoundary
  from '../../../../src/domain/migrations/GenesisEquivalenceBoundary.ts';
import GenesisEquivalenceReading
  from '../../../../src/domain/migrations/GenesisEquivalenceReading.ts';
import GenesisEquivalenceReadingFact, {
  type GenesisEquivalenceReadingFactKind,
} from '../../../../src/domain/migrations/GenesisEquivalenceReadingFact.ts';
import type { GraphModelMigrationPlannedGraphOperationKind }
  from '../../../../src/domain/migrations/GraphModelMigrationPlannedGraphOperation.ts';
import GraphModelMigrationScratchRef
  from '../../../../src/domain/migrations/GraphModelMigrationScratchRef.ts';
import { runMigrationGit } from './GitMigrationCommandRunner.ts';

const OPERATION_TREE_PATH = 'migration-operation.txt';

export type GraphModelMigrationScratchReadingBuilderOptions = {
  readonly repositoryPath: string;
  readonly scratchRefName: string;
  readonly readingId: string;
};

class ScratchOperationPayload {
  constructor(
    readonly kind: GraphModelMigrationPlannedGraphOperationKind,
    readonly sourceKey: string,
    readonly targetKey: string,
  ) {
    Object.freeze(this);
  }
}

export class GraphModelMigrationScratchReadingBuilderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphModelMigrationScratchReadingBuilderError';
  }
}

/** Builds an equivalence reading from scratch migration operation commits. */
export async function buildGraphModelMigrationScratchReading(
  options: GraphModelMigrationScratchReadingBuilderOptions,
): Promise<GenesisEquivalenceReading> {
  const repositoryPath = requireNonEmptyString(options.repositoryPath, 'repositoryPath');
  const scratchRef = new GraphModelMigrationScratchRef({ refName: options.scratchRefName });
  const commitIds = await gitLines(repositoryPath, ['rev-list', '--reverse', scratchRef.refName]);
  const facts: GenesisEquivalenceReadingFact[] = [];
  let operationIndex = 0;
  for (const commitId of commitIds) {
    const payload = parseScratchOperationPayload(
      await gitText(repositoryPath, ['show', `${commitId}:${OPERATION_TREE_PATH}`]),
    );
    facts.push(factFromPayload(payload, commitId, operationIndex));
    operationIndex += 1;
  }
  return new GenesisEquivalenceReading({
    readingId: requireNonEmptyString(options.readingId, 'readingId'),
    facts,
  });
}

function factFromPayload(
  payload: ScratchOperationPayload,
  commitId: string,
  operationIndex: number,
): GenesisEquivalenceReadingFact {
  const projected = projectedFactFromPayload(payload);
  return new GenesisEquivalenceReadingFact({
    kind: projected.kind,
    factKey: projected.factKey,
    fieldPath: projected.fieldPath,
    value: projected.value,
    boundary: new GenesisEquivalenceBoundary({
      writerId: 'scratch-migration',
      patchId: commitId,
      operationIndex,
    }),
  });
}

function projectedFactFromPayload(payload: ScratchOperationPayload): {
  readonly kind: GenesisEquivalenceReadingFactKind;
  readonly factKey: string;
  readonly fieldPath: string;
  readonly value: string;
} {
  if (payload.kind === 'node-record') {
    return projected('node', payload.targetKey, 'visibility', 'visible');
  }
  if (payload.kind === 'edge-record') {
    return projected('edge', payload.targetKey, 'visibility', 'visible');
  }
  return compatibilityFactFromPayload(payload);
}

function compatibilityFactFromPayload(payload: ScratchOperationPayload): {
  readonly kind: GenesisEquivalenceReadingFactKind;
  readonly factKey: string;
  readonly fieldPath: string;
  readonly value: string;
} {
  if (payload.kind === 'property') {
    return projected('property', payload.targetKey, 'value', `migration-source:${payload.sourceKey}`);
  }
  if (payload.kind === 'content-attachment') {
    return projected(
      'content-attachment',
      payload.targetKey,
      'payload.oid',
      `migration-source:${payload.sourceKey}`,
    );
  }
  throw new GraphModelMigrationScratchReadingBuilderError(`unsupported scratch operation kind ${payload.kind}`);
}

function projected(
  kind: GenesisEquivalenceReadingFactKind,
  factKey: string,
  fieldPath: string,
  value: string,
) {
  return Object.freeze({ kind, factKey, fieldPath, value });
}

function parseScratchOperationPayload(text: string): ScratchOperationPayload {
  const lines = text.split('\n').filter((line) => line.length > 0);
  if (lines[0] !== 'git-warp-v18-migration-operation-v1') {
    throw new GraphModelMigrationScratchReadingBuilderError('scratch operation payload header is unsupported');
  }
  const fields = payloadFields(lines.slice(1));
  return new ScratchOperationPayload(
    requireKind(fields.get('kind')),
    requireField(fields, 'source-key-utf8-hex'),
    requireField(fields, 'target-key-utf8-hex'),
  );
}

function payloadFields(lines: readonly string[]): ReadonlyMap<string, string> {
  const fields = new Map<string, string>();
  for (const line of lines) {
    const separator = line.indexOf(' ');
    if (separator <= 0) {
      throw new GraphModelMigrationScratchReadingBuilderError(`invalid scratch operation line ${line}`);
    }
    fields.set(line.slice(0, separator), line.slice(separator + 1));
  }
  return fields;
}

function requireKind(value: string | undefined): GraphModelMigrationPlannedGraphOperationKind {
  if (
    value === 'node-record'
    || value === 'edge-record'
    || value === 'property'
    || value === 'content-attachment'
  ) {
    return value;
  }
  throw new GraphModelMigrationScratchReadingBuilderError('scratch operation kind is unsupported');
}

function requireField(fields: ReadonlyMap<string, string>, fieldName: string): string {
  const encoded = fields.get(fieldName);
  if (encoded === undefined) {
    throw new GraphModelMigrationScratchReadingBuilderError(`scratch operation is missing ${fieldName}`);
  }
  return utf8FromHex(encoded);
}

function utf8FromHex(hex: string): string {
  if (hex.length % 2 !== 0) {
    throw new GraphModelMigrationScratchReadingBuilderError('hex field has odd length');
  }
  const bytes: number[] = [];
  for (let index = 0; index < hex.length; index += 2) {
    bytes.push(parseHexByte(hex.slice(index, index + 2)));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

function parseHexByte(hex: string): number {
  if (!/^[0-9a-f]{2}$/iu.test(hex)) {
    throw new GraphModelMigrationScratchReadingBuilderError(`invalid hex byte ${hex}`);
  }
  return Number.parseInt(hex, 16);
}

async function gitLines(cwd: string, args: readonly string[]): Promise<readonly string[]> {
  const output = await gitText(cwd, args);
  if (output.length === 0) {
    return Object.freeze([]);
  }
  return Object.freeze(output.split('\n').filter((line) => line.length > 0));
}

async function gitText(cwd: string, args: readonly string[]): Promise<string> {
  const result = await runMigrationGit(cwd, args, null);
  if (!result.ok()) {
    throw new GraphModelMigrationScratchReadingBuilderError(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new GraphModelMigrationScratchReadingBuilderError(`${name} must be a non-empty string`);
  }
  return value;
}
