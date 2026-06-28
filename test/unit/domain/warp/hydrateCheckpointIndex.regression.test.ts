import { describe, it, expect } from 'vitest';
import MaterializeController from '../../../../src/domain/services/controllers/MaterializeController.ts';
import { createEmptyState, applyPatchOp } from '../../../../src/domain/services/JoinReducer.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import MaterializedViewService from '../../../../src/domain/services/MaterializedViewService.ts';
import defaultCrypto from '../../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';

/**
 * @param {string[]} nodes
 * @param {Array<[string, string, string]>} edges
 */
function buildState(nodes, edges) {
  const state = createEmptyState();
  const writer = 'w1';
  const sha = 'a'.repeat(40);
  let lamport = 1;
  let opIdx = 0;

  for (const nodeId of nodes) {
    applyPatchOp(
      state,
      { type: 'NodeAdd', node: nodeId, dot: Dot.create(writer, lamport) },
      new EventId(lamport, writer, sha, opIdx++),
    );
    lamport++;
  }
  for (const [from, to, label] of edges) {
    applyPatchOp(
      state,
      { type: 'EdgeAdd', from, to, label, dot: Dot.create(writer, lamport) },
      new EventId(lamport, writer, sha, opIdx++),
    );
    lamport++;
  }
  return state;
}

describe('materialize stale-checkpoint regression', () => {
  it('does not overwrite freshly built index with stale checkpoint index data', async () => {
    const latestState = buildState(
      ['A', 'B', 'C'],
      [['A', 'B', 'knows'], ['A', 'C', 'manages']],
    );

    // MaterializeDeps mock: patches returns a checkpoint with latestState and no new patches.
    const deps = (({
      clock: { now: () => 0, timestamp: () => 0 },
      logger: { info() {}, warn() {}, error() {}, debug() {} },
      codec: defaultCodec,
      crypto: defaultCrypto,
      persistence: {},
      getSeekCache: () => null,
      graphName: 'test',
      graphCloner: {},
      patches: {
        loadCheckpoint: async () => ({
          schema: 5,
          state: latestState,
          frontier: new Map(),
          provenanceIndex: null,
        }),
        loadPatchesSince: async () => [],
        discoverWriters: async () => [],
        loadWriterPatches: async () => [],
        collectForFrontier: async () => [],
        getFrontier: async () => new Map(),
        loadPatchChain: async () => [],
      },
    }) as any);

    const ctrl = new MaterializeController(deps);
    const result = await ctrl.materialize({});

    // The result should reflect latestState which has A, B, C with two edges.
    const viewService = new MaterializedViewService({ codec: defaultCodec });
    const viewResult = viewService.build(result.state);
    const neighbors = viewResult.logicalIndex
      .getEdges('A', 'out')
      .map((/** @type {{neighborId: string}} */ e) => e.neighborId)
      .sort();

    expect(neighbors).toEqual(['B', 'C']);
  });
});
