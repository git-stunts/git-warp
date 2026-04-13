import { describe, it, expect } from 'vitest';
import MaterializeController from '../../../../src/domain/services/controllers/MaterializeController.js';
import { createEmptyState, applyOpV2 } from '../../../../src/domain/services/JoinReducer.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import MaterializedViewService from '../../../../src/domain/services/MaterializedViewService.ts';

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
    applyOpV2(
      state,
      { type: 'NodeAdd', node: nodeId, dot: Dot.create(writer, lamport) },
      new EventId(lamport, writer, sha, opIdx++),
    );
    lamport++;
  }
  for (const [from, to, label] of edges) {
    applyOpV2(
      state,
      { type: 'EdgeAdd', from, to, label, dot: Dot.create(writer, lamport) },
      new EventId(lamport, writer, sha, opIdx++),
    );
    lamport++;
  }
  return state;
}

/**
 * @param {import('../../../../src/domain/services/JoinReducer.ts').WarpState} state
 */
function buildLogicalIndex(state) {
  return new MaterializedViewService().build(state).logicalIndex;
}

describe('materialize stale-checkpoint regression', () => {
  it('does not overwrite freshly built index with stale checkpoint index data', async () => {
    const staleCheckpointState = buildState(
      ['A', 'B'],
      [['A', 'B', 'knows']],
    );
    const latestState = buildState(
      ['A', 'B', 'C'],
      [['A', 'B', 'knows'], ['A', 'C', 'manages']],
    );
    const staleIndex = buildLogicalIndex(staleCheckpointState);

    let hydrateCalled = false;
    /** @type {any} */
    const host = {
      _clock: { now: () => 0 },
      _seekCeiling: null,
      _loadLatestCheckpoint: async () => ({
        schema: 4,
        state: latestState,
        frontier: new Map(),
        indexShardOids: { 'meta_stale.cbor': 'oid_stale' },
      }),
      _loadPatchesSince: async () => [],
      _maxObservedLamport: 0,
      _cachedIndexTree: null,
      _viewService: new MaterializedViewService(),
      _cachedState: null,
      _stateDirty: false,
      _versionVector: null,
      _crypto: null,
      _codec: null,
      _adjacencyCache: null,
      _materializedGraph: null,
      _cachedViewHash: null,
      _logicalIndex: null,
      _propertyReader: null,
      _indexDegraded: false,
      // Old buggy path invoked this and replaced the fresh index with stale checkpoint data.
      async hydrateCheckpointIndex() {
        hydrateCalled = true;
        this._logicalIndex = staleIndex;
      },
      getFrontier: async () => new Map(),
      _checkpointPolicy: null,
      _checkpointing: false,
      _maybeRunGC: () => {},
      _subscribers: [],
      _lastNotifiedState: createEmptyState(),
      _notifySubscribers: () => {},
      _logTiming: () => {},
      _provenanceDegraded: false,
      _cachedCeiling: null,
      _cachedFrontier: null,
      _lastFrontier: new Map(),
      _patchesSinceCheckpoint: 0,
    };

    // Patch _setMaterializedState to mimic the real one for this test
    const ctrl = new MaterializeController(host);
    // Override _setMaterializedState to a simplified version that builds index
    /** @type {any} */ (ctrl)._setMaterializedState = async (/** @type {import('../../../../src/domain/services/JoinReducer.ts').WarpState} */ state) => {
      const result = host._viewService.build(state);
      host._cachedState = state;
      host._stateDirty = false;
      host._logicalIndex = result.logicalIndex;
      host._cachedIndexTree = result.tree;
      host._materializedGraph = { state, stateHash: null, adjacency: { outgoing: new Map(), incoming: new Map() } };
      return host._materializedGraph;
    };

    await ctrl.materialize({});

    expect(hydrateCalled).toBe(false);
    const neighbors = host._logicalIndex
      .getEdges('A', 'out')
      .map((/** @type {{neighborId: string}} */ e) => e.neighborId)
      .sort();
    expect(neighbors).toEqual(['B', 'C']);
  });
});
