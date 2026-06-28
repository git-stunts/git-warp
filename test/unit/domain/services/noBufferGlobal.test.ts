import { describe, it, expect } from 'vitest';
import LogicalIndexReader from '../../../../src/domain/services/index/LogicalIndexReader.ts';
import IncrementalIndexUpdater from '../../../../src/domain/services/index/IncrementalIndexUpdater.ts';
import MaterializedViewService from '../../../../src/domain/services/MaterializedViewService.ts';
import { createEmptyState, applyPatchOp } from '../../../../src/domain/services/JoinReducer.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import computeShardKey from '../../../../src/domain/utils/shardKey.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';

/**
 * @returns {import('../../../../src/domain/services/JoinReducer.ts').WarpState}
 */
function buildState() {
  const state = createEmptyState();
  const writer = 'w1';
  const sha = 'a'.repeat(40);
  let lamport = 1;
  let opIdx = 0;

  for (const nodeId of ['A', 'B']) {
    applyPatchOp(
      state,
      { type: 'NodeAdd', node: nodeId, dot: Dot.create(writer, lamport) },
      new EventId(lamport, writer, sha, opIdx++),
    );
    lamport++;
  }
  applyPatchOp(
    state,
    { type: 'EdgeAdd', from: 'A', to: 'B', label: 'knows', dot: Dot.create(writer, lamport) },
    new EventId(lamport, writer, sha, opIdx++),
  );
  lamport++;
  applyPatchOp(
    state,
    { type: 'PropSet', node: 'A', key: 'name', value: 'Alice' },
    new EventId(lamport, writer, sha, opIdx++),
  );

  return state;
}

describe('Buffer-free index paths', () => {
  // B133: Intentional globalThis.Buffer mutation.
  // This test verifies index operations work without the Buffer global.
  // The mutation is safely scoped within a try/finally that restores
  // the original value, preventing cross-test contamination.
  it('builds, reads, and incrementally updates without globalThis.Buffer', () => {
    const globalRef = /** @type {{ Buffer: unknown }} */ ((globalThis));
    const originalBuffer = globalRef.Buffer;

    try {
      (globalRef as any).Buffer = undefined;

      const state = buildState();
      const { tree } = new MaterializedViewService({ codec: defaultCodec }).build(state);

      const logicalIndex = new LogicalIndexReader({ codec: defaultCodec }).loadFromTree(tree).toLogicalIndex();
      expect(logicalIndex.isAlive('A')).toBe(true);
      expect(logicalIndex.getEdges('A', 'out').map((e) => e.neighborId)).toEqual(['B']);

      const updater = new IncrementalIndexUpdater({ codec: defaultCodec });
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
