import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Plumbing from '@git-stunts/plumbing';

import GraphModelMigrationRuntimeReplayRequest
  from '../../../../src/domain/migrations/GraphModelMigrationRuntimeReplayRequest.ts';
import {
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_SIZE_PROPERTY_KEY,
  isLegacyEdgePropNode,
} from '../../../../src/domain/services/KeyCodec.ts';
import type SnapshotWarpState
  from '../../../../src/domain/services/snapshot/SnapshotWarpState.ts';
import { openRuntimeHostProduct } from '../../../../src/domain/warp/RuntimeHostProduct.ts';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import GitCasRepositoryAdapter from '../../../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import { compareStrings } from '../../../../src/domain/utils/StringComparison.ts';
import {
  type GraphModelMigrationScratchOperationRecord,
  readGraphModelMigrationScratchOperationRecords,
} from './GraphModelMigrationScratchReadingBuilder.ts';
import {
  GraphModelMigrationScratchRuntimeReplayerError,
  GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_SCRATCH_HEAD_CHANGED,
  GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_SCRATCH_REF_UNREADABLE,
} from './GraphModelMigrationScratchRuntimeReplayErrors.ts';
import {
  observedGraphModelMigrationScratchHead,
  optionalGraphModelMigrationRuntimeReplayString,
  requireGraphModelMigrationRuntimeReplayRequest,
  requireGraphModelMigrationRuntimeReplayString,
} from './GraphModelMigrationScratchRuntimeReplayValidation.ts';
import {
  decodeGraphModelMigrationScratchEdgePropertyOwner,
  parseGraphModelMigrationScratchEdgeTarget,
  parseGraphModelMigrationScratchNodeContentTarget,
  parseGraphModelMigrationScratchPropertyTarget,
} from './GraphModelMigrationScratchRuntimeReplayTargets.ts';

export {
  GraphModelMigrationScratchRuntimeReplayerError,
  GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_INVALID_OPERATION_TARGET,
  GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_SCRATCH_HEAD_CHANGED,
  GRAPH_MODEL_MIGRATION_RUNTIME_REPLAY_SCRATCH_REF_UNREADABLE,
  type GraphModelMigrationScratchRuntimeReplayErrorCode,
} from './GraphModelMigrationScratchRuntimeReplayErrors.ts';

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
  const sourceRepositoryPath = requireGraphModelMigrationRuntimeReplayString(
    options.sourceRepositoryPath,
    'sourceRepositoryPath',
  );
  const request = requireGraphModelMigrationRuntimeReplayRequest(options.request);
  const observedHead = await observedGraphModelMigrationScratchHead(sourceRepositoryPath, request);
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
  const sourceRepositoryPath = requireGraphModelMigrationRuntimeReplayString(
    options.sourceRepositoryPath,
    'sourceRepositoryPath',
  );
  const request = requireGraphModelMigrationRuntimeReplayRequest(options.request);
  let runtimeRepositoryPath = optionalGraphModelMigrationRuntimeReplayString(
    options.runtimeRepositoryPath,
    'runtimeRepositoryPath',
  );
  let shouldCleanup = false;
  if (runtimeRepositoryPath === null) {
    runtimeRepositoryPath = await mkdtemp(join(tmpdir(), 'git-warp-v18-runtime-replay-'));
    shouldCleanup = true;
  }
  let persistence: GitTimelineHistoryAdapter | null = null;
  let runtimeStorage: GitCasRepositoryAdapter | null = null;
  try {
    const operations = await readGraphModelMigrationScratchOperationRecords({
      repositoryPath: sourceRepositoryPath,
      scratchRefName: request.scratchRef.refName,
    });
    const plumbing = await Plumbing.createDefault({ cwd: runtimeRepositoryPath });
    await plumbing.execute({ args: ['init', '-q'] });
    await plumbing.execute({ args: ['config', 'user.email', 'git-warp@example.invalid'] });
    await plumbing.execute({ args: ['config', 'user.name', 'git-warp migration replay'] });
    persistence = new GitTimelineHistoryAdapter({ plumbing });
    runtimeStorage = new GitCasRepositoryAdapter({ plumbing, history: persistence });
    const graph = await openRuntimeHostProduct({
      persistence,
      runtimeStorage,
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
    try {
      await runtimeStorage?.close();
    } finally {
      try {
        await persistence?.close();
      } finally {
        if (shouldCleanup && runtimeRepositoryPath !== null) {
          await rm(runtimeRepositoryPath, { recursive: true, force: true });
        }
      }
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
    const edge = parseGraphModelMigrationScratchEdgeTarget(operation.targetKey);
    patch.addEdge(edge.from, edge.to, edge.label);
  }
  for (const operation of sortedOperations(operations, 'property')) {
    const property = parseGraphModelMigrationScratchPropertyTarget(operation.targetKey);
    applyPropertyOperation(patch, property, `migration-source:${operation.sourceKey}`);
  }
  for (const operation of sortedOperations(operations, 'content-attachment')) {
    const nodeId = parseGraphModelMigrationScratchNodeContentTarget(operation.targetKey);
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
  setEdgeProperty(
    from: string,
    to: string,
    label: string,
    key: string,
    value: string,
  ): RuntimePatch;
  attachContent(nodeId: string, content: string, metadata: { readonly mime: string }): Promise<RuntimePatch>;
  commit(): Promise<string>;
};

function applyPropertyOperation(
  patch: RuntimePatch,
  property: {
    readonly ownerId: string;
    readonly propertyKey: string;
  },
  value: string,
): void {
  if (!isLegacyEdgePropNode(property.ownerId)) {
    patch.setProperty(property.ownerId, property.propertyKey, value);
    return;
  }
  const edge = decodeGraphModelMigrationScratchEdgePropertyOwner(property.ownerId);
  patch.setEdgeProperty(edge.from, edge.to, edge.label, property.propertyKey, value);
}

function sortedOperations(
  operations: readonly GraphModelMigrationScratchOperationRecord[],
  kind: GraphModelMigrationScratchOperationRecord['kind'],
): readonly GraphModelMigrationScratchOperationRecord[] {
  return Object.freeze([...operations]
    .filter((operation) => operation.kind === kind)
    .sort((left, right) => compareStrings(left.targetKey, right.targetKey)));
}


export function isGraphModelMigrationContentMetadataProperty(propertyKey: string): boolean {
  return propertyKey === CONTENT_MIME_PROPERTY_KEY || propertyKey === CONTENT_SIZE_PROPERTY_KEY;
}
