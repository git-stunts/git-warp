import { expect, vi } from 'vitest';
import InMemoryGraphAdapter from '../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import { openRuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';
import Patch from '../../../src/domain/types/Patch.ts';
import PersistenceError from '../../../src/domain/errors/PersistenceError.ts';
import computeShardKey from '../../../src/domain/utils/shardKey.ts';
import { buildCheckpointRef } from '../../../src/domain/utils/RefLayout.ts';
import { partitionShardOids } from '../../../src/domain/services/MaterializedViewHelpers.ts';
import { partitionTreeOids } from '../../../src/domain/services/state/checkpointHelpers.ts';

const TAIL_BUDGET_LIMIT = 10_000;
const TAIL_BUDGET_OBSERVED = TAIL_BUDGET_LIMIT + 1;

export const MISSING_NODE_ID = 'node:missing';
export const CHECKPOINT_NODE_ID = 'node:checkpoint-basis';
export const PROPERTY_KEY = 'title';
export const CHECKPOINT_PROPERTY_VALUE = 'checkpoint title';
export const TAIL_PROPERTY_VALUE = 'tail title';
export const UNSUPPORTED_TAIL_PROPERTY_VALUE = Object.freeze({ nested: TAIL_PROPERTY_VALUE });

const CREATE_INDEXED_BASIS_HINT = Object.freeze({
  operation: 'plumber.checkpoint.createIndexedBasis',
  retryMaySucceedAfterRecovery: true,
  requiresCallerConsent: true,
});
const RETRY_WITH_EXTENDED_BUDGET_HINT = Object.freeze({
  operation: 'plumber.optic.retryWithExtendedBudget',
  retryMaySucceedAfterRecovery: true,
  requiresCallerConsent: true,
});
const PREWARM_INDEX_HINT = Object.freeze({
  operation: 'plumber.checkpoint.prewarmIndex',
  retryMaySucceedAfterRecovery: true,
  requiresCallerConsent: true,
});

type ExpectedRecoveryHint = {
  readonly operation: string;
  readonly retryMaySucceedAfterRecovery: boolean;
  readonly requiresCallerConsent: boolean;
};

export type OpticFixtureGraph = Awaited<ReturnType<typeof openRuntimeHostProduct>>;
export type IndexedCheckpointGraph = Awaited<ReturnType<typeof openGraphWithIndexedCheckpoint>>;

function invokeObject(receiver: object, methodName: string, args: readonly string[] = []): object {
  const method = Reflect.get(receiver, methodName);
  if (typeof method !== 'function') {
    throw new Error(`${methodName}() must exist for v17 optic RED`);
  }

  const result = method.call(receiver, ...args);
  if (typeof result !== 'object' || result === null) {
    throw new Error(`${methodName}() must return an object for v17 optic RED`);
  }

  return result;
}

async function invokePromiseObject(receiver: object, methodName: string): Promise<object> {
  const method = Reflect.get(receiver, methodName);
  if (typeof method !== 'function') {
    throw new Error(`${methodName}() must exist for v17 optic RED`);
  }

  const result = method.call(receiver);
  if (!(result instanceof Promise)) {
    throw new Error(`${methodName}() must return a Promise for v17 optic RED`);
  }

  const awaited = await result;
  if (typeof awaited !== 'object' || awaited === null) {
    throw new Error(`${methodName}() must resolve to an object for v17 optic RED`);
  }

  return awaited;
}

export async function readNode(worldline: object, nodeId: string): Promise<object> {
  const optic = invokeObject(worldline, 'optic');
  const nodeScope = invokeObject(optic, 'node', [nodeId]);
  return await invokePromiseObject(nodeScope, 'read');
}

export async function readNodeProperty(
  worldline: object,
  nodeId: string,
  propertyKey: string,
): Promise<object> {
  const optic = invokeObject(worldline, 'optic');
  const nodeScope = invokeObject(optic, 'node', [nodeId]);
  const propertyScope = invokeObject(nodeScope, 'prop', [propertyKey]);
  return await invokePromiseObject(propertyScope, 'read');
}

export function expectReadIdentity(result: object): void {
  expect(result).toHaveProperty('readIdentity');
  expect(result).not.toHaveProperty('stateHash');
}

export function expectTailWitnessCount(result: object, count: number): void {
  const readIdentity = Reflect.get(result, 'readIdentity');
  expect(Reflect.get(readIdentity, 'tailWitnesses')).toHaveLength(count);
}

export function expectNoBoundedBasisFailure(options: {
  readonly read: Promise<object>;
  readonly graphName: string;
  readonly opticKind: 'node' | 'node-property';
  readonly target: object;
  readonly cause: string;
  readonly recoveryHints?: readonly ExpectedRecoveryHint[];
}): Promise<void> {
  return expect(options.read)
    .rejects
    .toMatchObject({
      code: 'E_OPTIC_NO_BOUNDED_BASIS',
      context: {
        graphName: options.graphName,
        opticKind: options.opticKind,
        target: options.target,
        cause: options.cause,
        reason: options.cause,
        recoveryHints: options.recoveryHints ?? [CREATE_INDEXED_BASIS_HINT],
      },
    });
}

export function expectShardUnavailableFailure(options: {
  readonly read: Promise<object>;
  readonly graphName: string;
  readonly opticKind: 'node-property';
  readonly target: object;
}): Promise<void> {
  return expectNoBoundedBasisFailure({
    ...options,
    cause: 'checkpoint-shard-unavailable',
    recoveryHints: [PREWARM_INDEX_HINT],
  });
}

export function expectTailBudgetExceededFailure(options: {
  readonly read: Promise<object>;
  readonly graphName: string;
  readonly opticKind: 'node' | 'node-property';
  readonly target: object;
}): Promise<void> {
  return expect(options.read)
    .rejects
    .toMatchObject({
      code: 'E_OPTIC_TAIL_BUDGET_EXCEEDED',
      context: {
        graphName: options.graphName,
        opticKind: options.opticKind,
        target: options.target,
        cause: 'tail-budget-exceeded',
        recoveryHints: [CREATE_INDEXED_BASIS_HINT, RETRY_WITH_EXTENDED_BUDGET_HINT],
        budgetKind: 'maxTailPatches',
        budgetLimit: TAIL_BUDGET_LIMIT,
        budgetObserved: TAIL_BUDGET_OBSERVED,
        budgetUnit: 'patch',
      },
    });
}

export function createTailBudgetExceededPatchEntries(): Array<{ readonly patch: Patch; readonly sha: string }> {
  return Array.from({ length: TAIL_BUDGET_OBSERVED }, (_unused, index) => Object.freeze({
    patch: new Patch({
      writer: 'reader',
      lamport: index + 1,
      context: {},
      ops: [],
    }),
    sha: `tail-budget-${index}`,
  }));
}

export function mockTailBudgetExceeded(graph: OpticFixtureGraph): void {
  vi.spyOn(graph, '_loadWriterPatches')
    .mockResolvedValue(createTailBudgetExceededPatchEntries());
}

export async function openEmptyGraph(graphName: string): Promise<OpticFixtureGraph> {
  return await openRuntimeHostProduct({
    persistence: new InMemoryGraphAdapter(),
    graphName,
    writerId: 'reader',
  });
}

export async function openGraphWithIndexedCheckpoint(graphName: string): Promise<OpticFixtureGraph> {
  const graph = await openEmptyGraph(graphName);
  await graph.patch((patch) => {
    patch.addNode(CHECKPOINT_NODE_ID);
    patch.setProperty(CHECKPOINT_NODE_ID, PROPERTY_KEY, CHECKPOINT_PROPERTY_VALUE);
  });
  await graph.materialize();
  await graph.createCheckpoint();
  return graph;
}

export function spyMaterializeGraphFailure(
  graph: OpticFixtureGraph,
  message: string,
): ReturnType<typeof vi.spyOn> {
  const materializeGraph = vi.spyOn(graph, '_materializeGraph');
  materializeGraph.mockRejectedValue(new Error(message));
  return materializeGraph;
}

export async function makeCheckpointPropertyShardUnavailable(
  graph: IndexedCheckpointGraph,
  nodeId: string,
): Promise<void> {
  const propertyShardOid = await checkpointPropertyShardOid(graph, nodeId);
  const originalReadBlob = graph._persistence.readBlob.bind(graph._persistence);
  vi.spyOn(graph._persistence, 'readBlob').mockImplementation(async (oid: string) => {
    if (oid === propertyShardOid) {
      throw new PersistenceError(
        `Blob not found: ${oid}`,
        PersistenceError.E_MISSING_OBJECT,
      );
    }
    return await originalReadBlob(oid);
  });
}

export async function makeCheckpointPropertyShardInvalid(
  graph: IndexedCheckpointGraph,
  nodeId: string,
): Promise<void> {
  const propertyShardOid = await checkpointPropertyShardOid(graph, nodeId);
  const originalReadBlob = graph._persistence.readBlob.bind(graph._persistence);
  vi.spyOn(graph._persistence, 'readBlob').mockImplementation(async (oid: string) => {
    if (oid === propertyShardOid) {
      return graph._codec.encode(Object.freeze({ invalid: true }));
    }
    return await originalReadBlob(oid);
  });
}

async function checkpointPropertyShardOid(
  graph: IndexedCheckpointGraph,
  nodeId: string,
): Promise<string> {
  const checkpointSha = await graph._persistence.readRef(buildCheckpointRef(graph.graphName));
  if (checkpointSha === null) {
    throw new Error('indexed checkpoint fixture must publish a checkpoint ref');
  }
  const checkpointMessage = graph._commitMessageCodec.decodeCheckpoint(
    await graph._persistence.showNode(checkpointSha),
  );
  const { treeOids, indexShardOids } = partitionTreeOids(
    await graph._persistence.readTreeOids(checkpointMessage.indexOid),
  );
  const shardOids = Object.keys(indexShardOids).length > 0
    ? indexShardOids
    : await nestedIndexShardOids(graph, treeOids);
  const { propOids } = partitionShardOids(shardOids);
  const path = `props_${computeShardKey(nodeId)}.cbor`;
  const oid = propOids[path];
  if (oid === undefined) {
    throw new Error(`indexed checkpoint fixture must include ${path}`);
  }
  return oid;
}

async function nestedIndexShardOids(
  graph: IndexedCheckpointGraph,
  treeOids: Record<string, string>,
): Promise<Record<string, string>> {
  const indexTreeOid = treeOids['index'];
  if (indexTreeOid === undefined) {
    throw new Error('indexed checkpoint fixture must include index subtree');
  }
  return await graph._persistence.readTreeOids(indexTreeOid);
}
