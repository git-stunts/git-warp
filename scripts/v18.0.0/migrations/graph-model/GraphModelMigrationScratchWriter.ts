import GraphModelMigrationLoweredOperation
  from '../../../../src/domain/migrations/GraphModelMigrationLoweredOperation.ts';
import GraphModelMigrationLoweredPatchPlan
  from '../../../../src/domain/migrations/GraphModelMigrationLoweredPatchPlan.ts';
import GraphModelMigrationNotice
  from '../../../../src/domain/migrations/GraphModelMigrationNotice.ts';
import GraphModelMigrationScratchRef
  from '../../../../src/domain/migrations/GraphModelMigrationScratchRef.ts';
import GraphModelMigrationScratchWrittenPatch
  from '../../../../src/domain/migrations/GraphModelMigrationScratchWrittenPatch.ts';
import GraphModelMigrationScratchWriteResult
  from '../../../../src/domain/migrations/GraphModelMigrationScratchWriteResult.ts';
import { runMigrationGit } from './GitMigrationCommandRunner.ts';

const ZERO_OID = '0000000000000000000000000000000000000000';
const OPERATION_TREE_PATH = 'migration-operation.txt';

export type GraphModelMigrationScratchWriterOptions = {
  readonly repositoryPath: string;
  readonly scratchRefName: string | null;
  readonly patchPlan: GraphModelMigrationLoweredPatchPlan;
};

export class GraphModelMigrationScratchWriterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphModelMigrationScratchWriterError';
  }
}

/** Writes lowered graph-model migration operations to an explicit scratch ref. */
export async function writeGraphModelMigrationScratchHistory(
  options: GraphModelMigrationScratchWriterOptions,
): Promise<GraphModelMigrationScratchWriteResult> {
  const repositoryPath = requireNonEmptyString(options.repositoryPath, 'repositoryPath');
  const scratchRefNotice = GraphModelMigrationScratchRef.validateRefName(options.scratchRefName);
  if (scratchRefNotice !== null) {
    return blockedResult(null, scratchRefNotice);
  }
  const scratchRef = new GraphModelMigrationScratchRef({ refName: requireScratchRefName(options.scratchRefName) });
  const patchPlan = requirePatchPlan(options.patchPlan);
  const gitRefNotice = await validateGitRefName(repositoryPath, scratchRef);
  if (gitRefNotice !== null) {
    return blockedResult(scratchRef, gitRefNotice);
  }

  let currentHead = await gitTextOrNull(repositoryPath, ['show-ref', '--verify', '--hash', scratchRef.refName]);
  const writtenPatches: GraphModelMigrationScratchWrittenPatch[] = [];
  let sequence = 0;
  for (const operation of patchPlan.operations) {
    const commitId = await writeOperationCommit({
      repositoryPath,
      patchPlan,
      operation,
      sequence,
      parentHead: currentHead,
    });
    await advanceScratchRef(repositoryPath, scratchRef, commitId, currentHead);
    currentHead = commitId;
    writtenPatches.push(new GraphModelMigrationScratchWrittenPatch({
      commitId,
      operation,
      sequence,
    }));
    sequence += 1;
  }

  return new GraphModelMigrationScratchWriteResult({
    scratchRef,
    scratchHead: currentHead,
    writtenPatches,
    warnings: [],
    fatalErrors: [],
  });
}

async function writeOperationCommit(options: {
  readonly repositoryPath: string;
  readonly patchPlan: GraphModelMigrationLoweredPatchPlan;
  readonly operation: GraphModelMigrationLoweredOperation;
  readonly sequence: number;
  readonly parentHead: string | null;
}): Promise<string> {
  const payload = formatOperationPayload(options.patchPlan, options.operation, options.sequence);
  const blobOid = await gitTextWithInput(options.repositoryPath, ['hash-object', '-w', '--stdin'], payload);
  const treeOid = await gitTextWithInput(
    options.repositoryPath,
    ['mktree'],
    `100644 blob ${blobOid}\t${OPERATION_TREE_PATH}\n`,
  );
  const parentArgs = options.parentHead === null ? [] : ['-p', options.parentHead];
  return await gitTextWithInput(
    options.repositoryPath,
    ['commit-tree', treeOid, ...parentArgs],
    formatCommitMessage(options.patchPlan, options.operation, options.sequence),
    true,
  );
}

async function advanceScratchRef(
  repositoryPath: string,
  scratchRef: GraphModelMigrationScratchRef,
  commitId: string,
  expectedHead: string | null,
): Promise<void> {
  const expected = expectedHead ?? ZERO_OID;
  await gitText(repositoryPath, ['update-ref', scratchRef.refName, commitId, expected]);
}

async function validateGitRefName(
  repositoryPath: string,
  scratchRef: GraphModelMigrationScratchRef,
): Promise<GraphModelMigrationNotice | null> {
  const result = await runMigrationGit(repositoryPath, ['check-ref-format', scratchRef.refName], null);
  if (result.ok()) {
    return null;
  }
  return GraphModelMigrationNotice.fatal(
    'E_INVALID_SCRATCH_REF',
    `git rejected scratch migration ref ${scratchRef.refName}`,
  );
}

function blockedResult(
  scratchRef: GraphModelMigrationScratchRef | null,
  fatalError: GraphModelMigrationNotice,
): GraphModelMigrationScratchWriteResult {
  return new GraphModelMigrationScratchWriteResult({
    scratchRef,
    scratchHead: null,
    writtenPatches: [],
    warnings: [],
    fatalErrors: [fatalError],
  });
}

function formatOperationPayload(
  patchPlan: GraphModelMigrationLoweredPatchPlan,
  operation: GraphModelMigrationLoweredOperation,
  sequence: number,
): string {
  return [
    'git-warp-v18-migration-operation-v1',
    `sequence ${sequence}`,
    `kind ${operation.kind}`,
    `source-basis-utf8-hex ${utf8Hex(patchPlan.sourceBasis.toKey())}`,
    `target-basis-utf8-hex ${utf8Hex(patchPlan.targetBasis.toKey())}`,
    `source-key-utf8-hex ${utf8Hex(operation.sourceKey)}`,
    `target-key-utf8-hex ${utf8Hex(operation.targetKey)}`,
    `operation-key-utf8-hex ${utf8Hex(operation.toKey())}`,
    '',
  ].join('\n');
}

function formatCommitMessage(
  patchPlan: GraphModelMigrationLoweredPatchPlan,
  operation: GraphModelMigrationLoweredOperation,
  sequence: number,
): string {
  return [
    'git-warp v18 scratch migration operation',
    '',
    `Migration-Format: git-warp-v18-scratch-operation-v1`,
    `Operation-Sequence: ${sequence}`,
    `Operation-Kind: ${operation.kind}`,
    `Source-Basis-UTF8-Hex: ${utf8Hex(patchPlan.sourceBasis.toKey())}`,
    `Target-Basis-UTF8-Hex: ${utf8Hex(patchPlan.targetBasis.toKey())}`,
    `Operation-Key-UTF8-Hex: ${utf8Hex(operation.toKey())}`,
    '',
  ].join('\n');
}

function utf8Hex(value: string): string {
  const bytes = new TextEncoder().encode(value);
  const parts: string[] = [];
  for (const byte of bytes) {
    parts.push(byte.toString(16).padStart(2, '0'));
  }
  return parts.join('');
}

function requirePatchPlan(
  patchPlan: GraphModelMigrationLoweredPatchPlan,
): GraphModelMigrationLoweredPatchPlan {
  if (!(patchPlan instanceof GraphModelMigrationLoweredPatchPlan)) {
    throw new GraphModelMigrationScratchWriterError('patchPlan must be a GraphModelMigrationLoweredPatchPlan');
  }
  return patchPlan;
}

function requireScratchRefName(scratchRefName: string | null): string {
  if (scratchRefName === null) {
    throw new GraphModelMigrationScratchWriterError('scratchRefName must not be null after validation');
  }
  return scratchRefName;
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new GraphModelMigrationScratchWriterError(`${name} must be a non-empty string`);
  }
  return value;
}

async function gitText(cwd: string, args: readonly string[]): Promise<string> {
  const result = await runMigrationGit(cwd, args, null);
  if (!result.ok()) {
    throw new GraphModelMigrationScratchWriterError(
      `git ${args.join(' ')} failed: ${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

async function gitTextWithInput(
  cwd: string,
  args: readonly string[],
  input: string,
  deterministicIdentity = false,
): Promise<string> {
  const result = await runMigrationGit(cwd, args, input, { deterministicIdentity });
  if (!result.ok()) {
    throw new GraphModelMigrationScratchWriterError(
      `git ${args.join(' ')} failed: ${result.stderr}`,
    );
  }
  return result.stdout.trim();
}

async function gitTextOrNull(cwd: string, args: readonly string[]): Promise<string | null> {
  const result = await runMigrationGit(cwd, args, null);
  if (!result.ok()) {
    return null;
  }
  return result.stdout.trim();
}
