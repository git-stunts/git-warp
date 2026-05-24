import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Plumbing from '@git-stunts/plumbing';

import GraphModelMigrationRuntimeReplayRequest
  from '../../../../src/domain/migrations/GraphModelMigrationRuntimeReplayRequest.ts';
import {
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_PROPERTY_KEY,
  CONTENT_SIZE_PROPERTY_KEY,
} from '../../../../src/domain/services/KeyCodec.ts';
import type SnapshotWarpState
  from '../../../../src/domain/services/snapshot/SnapshotWarpState.ts';
import { openRuntimeHostProduct } from '../../../../src/domain/warp/RuntimeHostProduct.ts';
import GitGraphAdapter from '../../../../src/infrastructure/adapters/GitGraphAdapter.ts';
import { compareStrings } from '../../../../src/domain/utils/StringComparison.ts';
import {
  type GraphModelMigrationScratchOperationRecord,
  readGraphModelMigrationScratchOperationRecords,
} from './GraphModelMigrationScratchReadingBuilder.ts';
import { runMigrationGit } from './GitMigrationCommandRunner.ts';

const PROPERTY_TARGET_PREFIX = 'property-target-key:length-prefixed-v1:';
const CONTENT_ATTACHMENT_PREFIX = 'content-attachment:';
const NODE_CONTENT_SUFFIX = `:${CONTENT_PROPERTY_KEY}`;

export const GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_SCRATCH_REF_UNREADABLE =
  'E_RUNTIME_REPLAY_SCRATCH_REF_UNREADABLE';
export const GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_SCRATCH_HEAD_CHANGED =
  'E_RUNTIME_REPLAY_SCRATCH_HEAD_CHANGED';
export const GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_INVALID_OPERATION_TARGET =
  'E_RUNTIME_REPLAY_INVALID_OPERATION_TARGET';

export type GraphModelMigrationScratchRuntimeReplayErrorCode =
  | typeof GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_SCRATCH_REF_UNREADABLE
  | typeof GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_SCRATCH_HEAD_CHANGED
  | typeof GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_INVALID_OPERATION_TARGET;

export type GraphModelMigrationScratchRuntimeReplayOptions = {
  readonly sourceRepositoryPath: string;
  readonly runtimeRepositoryPath?: string | null;
  readonly request: GraphModelMigrationRuntimeReplayRequest;
};

export type GraphModelMigrationScratchRuntimeReplayOutput = {
  readonly request: GraphModelMigrationRuntimeReplayRequest;
  readonly operationCount: number;
  readonly state: SnapshotWarpState;
};

/** Verifies the scratch ref head, replays scratch operations, and materializes runtime state. */
export async function replayVerifiedGraphModelMigrationScratchIntoRuntime(
  options: GraphModelMigrationScratchRuntimeReplayOptions,
): Promise<GraphModelMigrationScratchRuntimeReplayOutput> {
  const sourceRepositoryPath = requireNonEmptyString(options.sourceRepositoryPath, 'sourceRepositoryPath');
  const request = requireReplayRequest(options.request);
  const observedHead = await observedScratchHead(sourceRepositoryPath, request);
  if (observedHead === null) {
    throw new GraphModelMigrationScratchRuntimeReplayerError(
      GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_SCRATCH_REF_UNREADABLE,
      'scratch ref is not readable',
    );
  }
  if (observedHead !== request.scratchHead) {
    throw new GraphModelMigrationScratchRuntimeReplayerError(
      GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_SCRATCH_HEAD_CHANGED,
      'scratch ref head changed',
    );
  }
  return await replayGraphModelMigrationScratchIntoRuntime({
    sourceRepositoryPath,
    runtimeRepositoryPath: options.runtimeRepositoryPath ?? null,
    request,
  });
}

/** Replays scratch operations into an isolated normal git-warp runtime. */
export async function replayGraphModelMigrationScratchIntoRuntime(
  options: GraphModelMigrationScratchRuntimeReplayOptions,
): Promise<GraphModelMigrationScratchRuntimeReplayOutput> {
  const sourceRepositoryPath = requireNonEmptyString(options.sourceRepositoryPath, 'sourceRepositoryPath');
  const request = requireReplayRequest(options.request);
  let runtimeRepositoryPath = options.runtimeRepositoryPath ?? null;
  let shouldCleanup = false;
  if (runtimeRepositoryPath === null) {
    runtimeRepositoryPath = await mkdtemp(join(tmpdir(), 'git-warp-v18-runtime-replay-'));
    shouldCleanup = true;
  }
  try {
    const operations = await readGraphModelMigrationScratchOperationRecords({
      repositoryPath: sourceRepositoryPath,
      scratchRefName: request.scratchRef.refName,
    });
    const plumbing = await Plumbing.createDefault({ cwd: runtimeRepositoryPath });
    await plumbing.execute({ args: ['init', '-q'] });
    await plumbing.execute({ args: ['config', 'user.email', 'git-warp@example.invalid'] });
    await plumbing.execute({ args: ['config', 'user.name', 'git-warp migration replay'] });
    const graph = await openRuntimeHostProduct({
      persistence: new GitGraphAdapter({ plumbing }),
      graphName: request.graphId,
      writerId: request.writerId,
    });
    const patch = await graph.createPatch();
    await applyOperations(patch, operations);
    await patch.commit();
    const state = await graph.materialize();
    return Object.freeze({
      request,
      operationCount: operations.length,
      state,
    });
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
    throw invalidTarget(`edge target ${targetKey} must use from->to:label format`);
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
    throw invalidTarget(`property target ${targetKey} must use length-prefixed target format`);
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
    throw invalidTarget('property target has trailing data');
  }
  return Object.freeze({ ownerId: ownerId.value, propertyKey: propertyKey.value });
}

function readLength(text: string, cursor: number): { readonly value: number; readonly nextCursor: number } {
  const separator = text.indexOf(':', cursor);
  if (separator <= cursor) {
    throw invalidTarget('length-prefixed field is malformed');
  }
  const raw = text.slice(cursor, separator);
  if (!/^[0-9]+$/u.test(raw)) {
    throw invalidTarget('length-prefixed field length is invalid');
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
    throw invalidTarget(`${label} field is truncated`);
  }
  const nextCursor = cursor + length;
  if (!separatorRequired) {
    return Object.freeze({ value, nextCursor });
  }
  if (text[nextCursor] !== ':') {
    throw invalidTarget(`${label} field is missing separator`);
  }
  return Object.freeze({ value, nextCursor: nextCursor + 1 });
}

function parseNodeContentTarget(targetKey: string): string {
  if (!targetKey.startsWith(CONTENT_ATTACHMENT_PREFIX) || !targetKey.endsWith(NODE_CONTENT_SUFFIX)) {
    throw invalidTarget(`content target ${targetKey} must identify a node ${CONTENT_PROPERTY_KEY} attachment`);
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

function invalidTarget(message: string): GraphModelMigrationScratchRuntimeReplayerError {
  return new GraphModelMigrationScratchRuntimeReplayerError(
    GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_INVALID_OPERATION_TARGET,
    message,
  );
}

function requireReplayRequest(
  request: GraphModelMigrationRuntimeReplayRequest,
): GraphModelMigrationRuntimeReplayRequest {
  if (!(request instanceof GraphModelMigrationRuntimeReplayRequest)) {
    throw new GraphModelMigrationScratchRuntimeReplayerError(
      GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_INVALID_OPERATION_TARGET,
      'request must be a GraphModelMigrationRuntimeReplayRequest',
    );
  }
  return request;
}

function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new GraphModelMigrationScratchRuntimeReplayerError(
      GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_INVALID_OPERATION_TARGET,
      `${name} must be a non-empty string`,
    );
  }
  return value;
}

export class GraphModelMigrationScratchRuntimeReplayerError extends Error {
  readonly code: GraphModelMigrationScratchRuntimeReplayErrorCode;

  constructor(code: GraphModelMigrationScratchRuntimeReplayErrorCode, message: string) {
    super(message);
    this.name = 'GraphModelMigrationScratchRuntimeReplayerError';
    this.code = code;
    Object.freeze(this);
  }
}

export function isGraphModelMigrationContentMetadataProperty(propertyKey: string): boolean {
  return propertyKey === CONTENT_MIME_PROPERTY_KEY || propertyKey === CONTENT_SIZE_PROPERTY_KEY;
}
