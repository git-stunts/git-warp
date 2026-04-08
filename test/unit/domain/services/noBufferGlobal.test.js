import { describe, it, expect } from 'vitest';
import LogicalIndexReader from '../../../../src/domain/services/index/LogicalIndexReader.js';
import IncrementalIndexUpdater from '../../../../src/domain/services/index/IncrementalIndexUpdater.js';
import MaterializedViewService from '../../../../src/domain/services/MaterializedViewService.js';
import { createEmptyStateV5, applyOpV2 } from '../../../../src/domain/services/JoinReducer.js';
import { createDot } from '../../../../src/domain/crdt/Dot.js';
import { createEventId } from '../../../../src/domain/utils/EventId.ts';
import computeShardKey from '../../../../src/domain/utils/shardKey.ts';

/**
 * @returns {import('../../../../src/domain/services/JoinReducer.js').WarpStateV5}
 */
function buildState() {
  const state = createEmptyStateV5();
  const writer = 'w1';
  const sha = 'a'.repeat(40);
  let lamport = 1;
  let opIdx = 0;

  for (const nodeId of ['A', 'B']) {
    applyOpV2(
      state,
      { type: 'NodeAdd', node: nodeId, dot: createDot(writer, lamport) },
      createEventId(lamport, writer, sha, opIdx++),
    );
    lamport++;
  }
  applyOpV2(
    state,
    { type: 'EdgeAdd', from: 'A', to: 'B', label: 'knows', dot: createDot(writer, lamport) },
    createEventId(lamport, writer, sha, opIdx++),
  );
  lamport++;
  applyOpV2(
    state,
    { type: 'PropSet', node: 'A', key: 'name', value: 'Alice' },
    createEventId(lamport, writer, sha, opIdx++),
  );

  return state;
}

describe('Buffer-free index paths', () => {
  // B133: Intentional globalThis.Buffer mutation.
  // This test verifies index operations work without the Buffer global.
  // The mutation is safely scoped within a try/finally that restores
  // the original value, preventing cross-test contamination.
  it('builds, reads, and incrementally updates without globalThis.Buffer', () => {
    const globalRef = /** @type {{ Buffer: unknown }} */ (/** @type {any} */ (globalThis));
    const originalBuffer = globalRef.Buffer;

    try {
      globalRef.Buffer = undefined;

      const state = buildState();
      const { tree } = new MaterializedViewService().build(state);

      const logicalIndex = new LogicalIndexReader().loadFromTree(tree).toLogicalIndex();
      expect(logicalIndex.isAlive('A')).toBe(true);
      expect(logicalIndex.getEdges('A', 'out').map((e) => e.neighborId)).toEqual(['B']);

      const updater = new IncrementalIndexUpdater();
      const diff = {
        nodesAdded: [],
        nodesRemoved: [],
        edgesAdded: [],
        edgesRemoved: [],
        propsChanged: [{ nodeId: 'A', key: 'role', value: 'lead', prevValue: undefined }],
      };
      const dirtyShards = updater.computeDirtyShards({
        diff,
        state,
        loadShard: (path) => tree[path],
      });

      const shardKey = computeShardKey('A');
      expect(dirtyShards[`props_${shardKey}.cbor`]).toBeDefined();
    } finally {
      globalRef.Buffer = originalBuffer;
    }
  });
});
