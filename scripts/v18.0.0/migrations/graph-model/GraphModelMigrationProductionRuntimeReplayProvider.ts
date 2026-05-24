import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Plumbing from '@git-stunts/plumbing';

import { openRuntimeHostProduct } from '../../../../src/domain/warp/RuntimeHostProduct.ts';
import GraphModelMigrationNotice from '../../../../src/domain/migrations/GraphModelMigrationNotice.ts';
import GraphModelMigrationRuntimeConformanceResult, {
  GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_FAILED,
  GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_PASSED,
} from '../../../../src/domain/migrations/GraphModelMigrationRuntimeConformanceResult.ts';
import GraphModelMigrationRuntimeReplayRequest
  from '../../../../src/domain/migrations/GraphModelMigrationRuntimeReplayRequest.ts';
import GraphModelMigrationRuntimeReplayResult, {
  GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_FAILED,
  GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_PASSED,
} from '../../../../src/domain/migrations/GraphModelMigrationRuntimeReplayResult.ts';
import GraphModelMigrationScratchWriteResult
  from '../../../../src/domain/migrations/GraphModelMigrationScratchWriteResult.ts';
import GitGraphAdapter from '../../../../src/infrastructure/adapters/GitGraphAdapter.ts';
import { compareStrings } from '../../../../src/domain/utils/StringComparison.ts';
import {
  type GraphModelMigrationScratchOperationRecord,
  readGraphModelMigrationScratchOperationRecords,
} from './GraphModelMigrationScratchReadingBuilder.ts';
import { runMigrationGit } from './GitMigrationCommandRunner.ts';

const WITNESS_ID = 'git-warp-v18-production-runtime-scratch-replay-v1';
const PROPERTY_TARGET_PREFIX = 'property-target-key:length-prefixed-v1:';
const CONTENT_ATTACHMENT_PREFIX = 'content-attachment:';
const NODE_CONTENT_SUFFIX = ':_content';

export type GraphModelMigrationProductionRuntimeReplayProviderOptions = {
  readonly sourceRepositoryPath: string;
  readonly graphId: string;
  readonly writerId?: string;
  readonly runtimeRepositoryPath?: string | null;
};

/** Builds finalization conformance evidence from production-runtime replay. */
export function createGraphModelMigrationProductionRuntimeConformanceProvider(
  options: GraphModelMigrationProductionRuntimeReplayProviderOptions,
): (scratchWriteResult: GraphModelMigrationScratchWriteResult) =>
  Promise<GraphModelMigrationRuntimeConformanceResult | null> {
  const checked = checkedProviderOptions(options);
  return async (scratchWriteResult) => {
    if (!(scratchWriteResult instanceof GraphModelMigrationScratchWriteResult)) {
      throw new GraphModelMigrationProductionRuntimeReplayProviderError(
        'scratchWriteResult must be a GraphModelMigrationScratchWriteResult',
      );
    }
    if (scratchWriteResult.scratchRef === null || scratchWriteResult.scratchHead === null) {
      return null;
    }
    const replayResult = await verifyGraphModelMigrationProductionRuntimeReplay({
      ...checked,
      request: new GraphModelMigrationRuntimeReplayRequest({
        graphId: checked.graphId,
        writerId: checked.writerId,
        scratchRef: scratchWriteResult.scratchRef,
        scratchHead: scratchWriteResult.scratchHead,
      }),
    });
    return runtimeConformanceFromReplay(replayResult);
  };
}

/** Verifies scratch output by replaying it through normal git-warp runtime. */
export async function verifyGraphModelMigrationProductionRuntimeReplay(options: {
  readonly sourceRepositoryPath: string;
  readonly runtimeRepositoryPath?: string | null;
  readonly request: GraphModelMigrationRuntimeReplayRequest;
}): Promise<GraphModelMigrationRuntimeReplayResult> {
  const sourceRepositoryPath = requireNonEmptyString(options.sourceRepositoryPath, 'sourceRepositoryPath');
  const request = requireReplayRequest(options.request);
  const observedHead = await observedScratchHead(sourceRepositoryPath, request);
  if (observedHead === null) {
    return failedReplay(request, 0, 'E_RUNTIME_REPLAY_SCRATCH_REF_UNREADABLE', 'scratch ref is not readable');
  }
  if (observedHead !== request.scratchHead) {
    return failedReplay(request, 0, 'E_RUNTIME_REPLAY_SCRATCH_HEAD_CHANGED', 'scratch ref head changed');
  }
  return await replayScratchOperations({
    sourceRepositoryPath,
    runtimeRepositoryPath: options.runtimeRepositoryPath ?? null,
    request,
  });
}

async function replayScratchOperations(options: {
  readonly sourceRepositoryPath: string;
  readonly runtimeRepositoryPath: string | null;
  readonly request: GraphModelMigrationRuntimeReplayRequest;
}): Promise<GraphModelMigrationRuntimeReplayResult> {
  let runtimeRepositoryPath = options.runtimeRepositoryPath;
  let shouldCleanup = false;
  if (runtimeRepositoryPath === null) {
    runtimeRepositoryPath = await mkdtemp(join(tmpdir(), 'git-warp-v18-runtime-replay-'));
    shouldCleanup = true;
  }
  try {
    const operations = await readGraphModelMigrationScratchOperationRecords({
      repositoryPath: options.sourceRepositoryPath,
      scratchRefName: options.request.scratchRef.refName,
    });
    const plumbing = await Plumbing.createDefault({ cwd: runtimeRepositoryPath });
    await plumbing.execute({ args: ['init', '-q'] });
    await plumbing.execute({ args: ['config', 'user.email', 'git-warp@example.invalid'] });
    await plumbing.execute({ args: ['config', 'user.name', 'git-warp migration replay'] });
    const graph = await openRuntimeHostProduct({
      persistence: new GitGraphAdapter({ plumbing }),
      graphName: options.request.graphId,
      writerId: options.request.writerId,
    });
    const patch = await graph.createPatch();
    await applyOperations(patch, operations);
    await patch.commit();
    await graph.materialize();
    return passedReplay(options.request, operations.length);
  } catch (error) {
    const invalidOperationTarget = error instanceof GraphModelMigrationProductionRuntimeReplayProviderError;
    return failedReplay(
      options.request,
      0,
      invalidOperationTarget ? 'E_RUNTIME_REPLAY_INVALID_OPERATION_TARGET' : 'E_RUNTIME_REPLAY_FAILED',
      error instanceof Error ? error.message : 'production runtime replay failed',
    );
  } finally {
    if (shouldCleanup && runtimeRepositoryPath !== null) {
      await rm(runtimeRepositoryPath, { recursive: true, force: true });
    }
  }
}

async function applyOperations(
  patch: RuntimePatch,
  operations: readonly GraphModelMigrationScratchOperationRecord[],
): Promise<void> {
  for (const operation of sortedOperations(operations, 'node-record')) {
    patch.addNode(operation.targetKey);
  }
  for (const operation of sortedOperations(operations, 'edge-record')) {
    const edge = parseEdgeTarget(operation.targetKey);
    patch.addEdge(edge.from, edge.to, edge.label);
  }
  for (const operation of sortedOperations(operations, 'property')) {
    const property = parsePropertyTarget(operation.targetKey);
    patch.setProperty(property.ownerId, property.propertyKey, `migration-source:${operation.sourceKey}`);
  }
  for (const operation of sortedOperations(operations, 'content-attachment')) {
    const nodeId = parseNodeContentTarget(operation.targetKey);
    await patch.attachContent(
      nodeId,
      `migration-source:${operation.sourceKey}`,
      { mime: 'text/plain' },
    );
  }
}

type RuntimePatch = {
  addNode(nodeId: string): RuntimePatch;
  addEdge(from: string, to: string, label: string): RuntimePatch;
  setProperty(nodeId: string, key: string, value: string): RuntimePatch;
  attachContent(nodeId: string, content: string, metadata: { readonly mime: string }): Promise<RuntimePatch>;
  commit(): Promise<string>;
};

function sortedOperations(
  operations: readonly GraphModelMigrationScratchOperationRecord[],
  kind: GraphModelMigrationScratchOperationRecord['kind'],
): readonly GraphModelMigrationScratchOperationRecord[] {
  return Object.freeze([...operations]
    .filter((operation) => operation.kind === kind)
    .sort((left, right) => compareStrings(left.targetKey, right.targetKey)));
}

function parseEdgeTarget(targetKey: string): { readonly from: string; readonly to: string; readonly label: string } {
  const arrowIndex = targetKey.indexOf('->');
  const labelIndex = targetKey.lastIndexOf(':');
  if (arrowIndex <= 0 || labelIndex <= arrowIndex + 2 || labelIndex === targetKey.length - 1) {
    throw new GraphModelMigrationProductionRuntimeReplayProviderError(
      `edge target ${targetKey} must use from->to:label format`,
    );
  }
  return Object.freeze({
    from: targetKey.slice(0, arrowIndex),
    to: targetKey.slice(arrowIndex + 2, labelIndex),
    label: targetKey.slice(labelIndex + 1),
  });
}

function parsePropertyTarget(targetKey: string): {
  readonly ownerId: string;
  readonly propertyKey: string;
} {
  if (!targetKey.startsWith(PROPERTY_TARGET_PREFIX)) {
    throw new GraphModelMigrationProductionRuntimeReplayProviderError(
      `property target ${targetKey} must use length-prefixed target format`,
    );
  }
  let cursor = PROPERTY_TARGET_PREFIX.length;
  const ownerLength = readLength(targetKey, cursor);
  cursor = ownerLength.nextCursor;
  const ownerId = readSizedField(targetKey, cursor, ownerLength.value, 'ownerId', true);
  cursor = ownerId.nextCursor;
  const propertyLength = readLength(targetKey, cursor);
  cursor = propertyLength.nextCursor;
  const propertyKey = readSizedField(targetKey, cursor, propertyLength.value, 'propertyKey', false);
  if (propertyKey.nextCursor !== targetKey.length) {
    throw new GraphModelMigrationProductionRuntimeReplayProviderError('property target has trailing data');
  }
  return Object.freeze({ ownerId: ownerId.value, propertyKey: propertyKey.value });
}

function readLength(text: string, cursor: number): { readonly value: number; readonly nextCursor: number } {
  const separator = text.indexOf(':', cursor);
  if (separator <= cursor) {
    throw new GraphModelMigrationProductionRuntimeReplayProviderError('length-prefixed field is malformed');
  }
  const raw = text.slice(cursor, separator);
  if (!/^[0-9]+$/u.test(raw)) {
    throw new GraphModelMigrationProductionRuntimeReplayProviderError('length-prefixed field length is invalid');
  }
  return Object.freeze({ value: Number(raw), nextCursor: separator + 1 });
}

function readSizedField(
  text: string,
  cursor: number,
  length: number,
  label: string,
  separatorRequired: boolean,
): { readonly value: string; readonly nextCursor: number } {
  const value = text.slice(cursor, cursor + length);
  if (value.length !== length) {
    throw new GraphModelMigrationProductionRuntimeReplayProviderError(`${label} field is truncated`);
  }
  const nextCursor = cursor + length;
  if (!separatorRequired) {
    return Object.freeze({ value, nextCursor });
  }
  if (text[nextCursor] !== ':') {
    throw new GraphModelMigrationProductionRuntimeReplayProviderError(`${label} field is missing separator`);
  }
  return Object.freeze({ value, nextCursor: nextCursor + 1 });
}

function parseNodeContentTarget(targetKey: string): string {
  if (!targetKey.startsWith(CONTENT_ATTACHMENT_PREFIX) || !targetKey.endsWith(NODE_CONTENT_SUFFIX)) {
    throw new GraphModelMigrationProductionRuntimeReplayProviderError(
      `content target ${targetKey} must identify a node _content attachment`,
    );
  }
  const legacyKey = targetKey.slice(CONTENT_ATTACHMENT_PREFIX.length);
  return legacyKey.slice(0, legacyKey.length - NODE_CONTENT_SUFFIX.length);
}

async function observedScratchHead(
  repositoryPath: string,
  request: GraphModelMigrationRuntimeReplayRequest,
): Promise<string | null> {
  const result = await runMigrationGit(
    repositoryPath,
    ['show-ref', '--verify', '--hash', request.scratchRef.refName],
    null,
  );
  if (!result.ok()) {
    return null;
  }
  const observedHead = result.stdout.trim();
  return observedHead.length === 0 ? null : observedHead;
}

function runtimeConformanceFromReplay(
  replayResult: GraphModelMigrationRuntimeReplayResult,
): GraphModelMigrationRuntimeConformanceResult {
  return new GraphModelMigrationRuntimeConformanceResult({
    scratchRef: replayResult.request.scratchRef,
    scratchHead: replayResult.request.scratchHead,
    status: replayResult.allowsFinalization()
      ? GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_PASSED
      : GRAPH_MODEL_MIGRATION_RUNTIME_CONFORMANCE_FAILED,
    witness: replayResult.witness,
    fatalErrors: replayResult.fatalErrors,
  });
}

function passedReplay(
  request: GraphModelMigrationRuntimeReplayRequest,
  replayedOperationCount: number,
): GraphModelMigrationRuntimeReplayResult {
  return new GraphModelMigrationRuntimeReplayResult({
    request,
    status: GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_PASSED,
    witness: `${WITNESS_ID} operations=${replayedOperationCount}`,
    replayedOperationCount,
    fatalErrors: [],
  });
}

function failedReplay(
  request: GraphModelMigrationRuntimeReplayRequest,
  replayedOperationCount: number,
  code: string,
  message: string,
): GraphModelMigrationRuntimeReplayResult {
  return new GraphModelMigrationRuntimeReplayResult({
    request,
    status: GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_FAILED,
    witness: WITNESS_ID,
    replayedOperationCount,
    fatalErrors: [GraphModelMigrationNotice.fatal(code, message)],
  });
}

function checkedProviderOptions(
  options: GraphModelMigrationProductionRuntimeReplayProviderOptions,
): Required<Pick<GraphModelMigrationProductionRuntimeReplayProviderOptions, 'sourceRepositoryPath' | 'graphId'>>
  & { readonly writerId: string; readonly runtimeRepositoryPath: string | null } {
  return Object.freeze({
    sourceRepositoryPath: requireNonEmptyString(options.sourceRepositoryPath, 'sourceRepositoryPath'),
    graphId: requireNonEmptyString(options.graphId, 'graphId'),
    writerId: requireNonEmptyString(options.writerId ?? 'scratch-migration', 'writerId'),
    runtimeRepositoryPath: options.runtimeRepositoryPath ?? null,
  });
}

function requireReplayRequest(
  request: GraphModelMigrationRuntimeReplayRequest,
): GraphModelMigrationRuntimeReplayRequest {
  if (!(request instanceof GraphModelMigrationRuntimeReplayRequest)) {
    throw new GraphModelMigrationProductionRuntimeReplayProviderError(
      'request must be a GraphModelMigrationRuntimeReplayRequest',
    );
  }
  return request;
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new GraphModelMigrationProductionRuntimeReplayProviderError(`${name} must be a non-empty string`);
  }
  return value;
}

export class GraphModelMigrationProductionRuntimeReplayProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphModelMigrationProductionRuntimeReplayProviderError';
  }
}
