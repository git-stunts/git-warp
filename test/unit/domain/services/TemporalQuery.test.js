import { describe, it, expect } from 'vitest';
import { TemporalQuery } from '../../../../src/domain/services/TemporalQuery.js';
import {
  createNodeAddV2,
  createPropSetV2,
  createPatchV2,
  createDot,
  createInlineValue,
} from '../../../helpers/warpGraphTestUtils.js';

/**
 * Creates a TemporalQuery with the given patches preloaded.
 *
 * @param {Array<{patch: Object, sha: string}>} patches
 * @returns {TemporalQuery}
 */
function createTemporalWithPatches(patches) {
  return new TemporalQuery({
    loadAllPatches: async () => patches,
  });
}

/**
 * Creates a patch that adds a node and sets a property on it.
 *
 * @param {Object} options
 * @param {string} options.nodeId - Node ID
 * @param {string} options.writer - Writer ID
 * @param {number} options.lamport - Lamport timestamp
 * @param {string} options.propKey - Property key
 * @param {*} options.propValue - Property value
 * @param {string} options.sha - Patch SHA
 * @param {boolean} [options.addNode=true] - Whether to include a NodeAdd op
 * @returns {{patch: Object, sha: string}}
 */
function createNodeWithPropPatch({
  nodeId,
  writer,
  lamport,
  propKey,
  propValue,
  sha,
  addNode = true,
}) {
  const ops = [];
  if (addNode) {
    ops.push(createNodeAddV2(nodeId, createDot(writer, lamport)));
  }
  ops.push(createPropSetV2(nodeId, propKey, createInlineValue(propValue)));
  return {
    patch: createPatchV2({ writer, lamport, ops }),
    sha,
  };
}

/**
 * Creates a property-only patch (no NodeAdd).
 */
function createPropOnlyPatch({ nodeId, writer, lamport, propKey, propValue, sha }) {
  return {
    patch: createPatchV2({
      writer,
      lamport,
      ops: [createPropSetV2(nodeId, propKey, createInlineValue(propValue))],
    }),
    sha,
  };
}

describe('TemporalQuery', () => {
  describe('always', () => {
    it('returns true when predicate holds at every tick', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 1,
          propKey: 'status',
          propValue: 'active',
          sha: 'a'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 2,
          propKey: 'count',
          propValue: 42,
          sha: 'b'.repeat(40),
        }),
      ];

      const tq = createTemporalWithPatches(patches);

      const result = await tq.always(
        'X',
        (n) => n.props.status === 'active',
        { since: 0 }
      );

      expect(result).toBe(true);
    });

    it('returns false when predicate fails at any tick', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 1,
          propKey: 'status',
          propValue: 'active',
          sha: 'a'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 2,
          propKey: 'status',
          propValue: 'inactive',
          sha: 'b'.repeat(40),
        }),
      ];

      const tq = createTemporalWithPatches(patches);

      const result = await tq.always(
        'X',
        (n) => n.props.status === 'active',
        { since: 0 }
      );

      expect(result).toBe(false);
    });

    it('returns false when node never existed', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'Y',
          writer: 'W',
          lamport: 1,
          propKey: 'status',
          propValue: 'active',
          sha: 'a'.repeat(40),
        }),
      ];

      const tq = createTemporalWithPatches(patches);

      // Query for a node that was never created
      const result = await tq.always(
        'X',
        (n) => n.props.status === 'active',
        { since: 0 }
      );

      expect(result).toBe(false);
    });

    it('returns true when node appears after since and predicate holds at all visible ticks', async () => {
      // Node is created at lamport 3, but we query since 0
      // Patches before the node exist contribute to state, but node
      // does not exist until lamport 3.
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'other',
          writer: 'W',
          lamport: 1,
          propKey: 'val',
          propValue: 1,
          sha: 'a'.repeat(40),
        }),
        createNodeWithPropPatch({
          nodeId: 'other',
          writer: 'W',
          lamport: 2,
          propKey: 'val',
          propValue: 2,
          sha: 'b'.repeat(40),
          addNode: false,
        }),
        createNodeWithPropPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 3,
          propKey: 'status',
          propValue: 'active',
          sha: 'c'.repeat(40),
        }),
      ];

      const tq = createTemporalWithPatches(patches);

      // always returns true here because the node exists at the only tick(s)
      // where it appears, and the predicate holds at those ticks.
      const result = await tq.always(
        'X',
        (n) => n.props.status === 'active',
        { since: 0 }
      );

      expect(result).toBe(true);
    });

    it('respects the since parameter to filter earlier ticks', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 1,
          propKey: 'status',
          propValue: 'draft',
          sha: 'a'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 2,
          propKey: 'status',
          propValue: 'active',
          sha: 'b'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 3,
          propKey: 'status',
          propValue: 'active',
          sha: 'c'.repeat(40),
        }),
      ];

      const tq = createTemporalWithPatches(patches);

      // Since 0: draft at tick 1 fails the predicate
      const resultAll = await tq.always(
        'X',
        (n) => n.props.status === 'active',
        { since: 0 }
      );
      expect(resultAll).toBe(false);

      // Since 2: only ticks 2 and 3 are checked, both active
      const resultSince2 = await tq.always(
        'X',
        (n) => n.props.status === 'active',
        { since: 2 }
      );
      expect(resultSince2).toBe(true);
    });

    it('handles single-tick history', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 1,
          propKey: 'status',
          propValue: 'active',
          sha: 'a'.repeat(40),
        }),
      ];

      const tq = createTemporalWithPatches(patches);

      const result = await tq.always(
        'X',
        (n) => n.props.status === 'active',
        { since: 0 }
      );

      expect(result).toBe(true);
    });

    it('returns false for empty patch history', async () => {
      const tq = createTemporalWithPatches([]);

      const result = await tq.always(
        'X',
        (n) => n.props.status === 'active',
        { since: 0 }
      );

      expect(result).toBe(false);
    });

    it('defaults since to 0 when not provided', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 1,
          propKey: 'status',
          propValue: 'active',
          sha: 'a'.repeat(40),
        }),
      ];

      const tq = createTemporalWithPatches(patches);

      // Call without options
      const result = await tq.always('X', (n) => n.props.status === 'active');

      expect(result).toBe(true);
    });

    it('provides correct snapshot properties to predicate', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 1,
          propKey: 'name',
          propValue: 'Alice',
          sha: 'a'.repeat(40),
        }),
      ];

      const tq = createTemporalWithPatches(patches);
      const snapshots = [];

      await tq.always('X', (n) => {
        snapshots.push({
          id: n.id,
          exists: n.exists,
          name: n.props.name,
        });
        return true;
      });

      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].id).toBe('X');
      expect(snapshots[0].exists).toBe(true);
      expect(snapshots[0].name).toBe('Alice');
    });
  });

  describe('eventually', () => {
    it('returns true when predicate holds at some tick', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 1,
          propKey: 'status',
          propValue: 'draft',
          sha: 'a'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 2,
          propKey: 'status',
          propValue: 'review',
          sha: 'b'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 3,
          propKey: 'status',
          propValue: 'merged',
          sha: 'c'.repeat(40),
        }),
      ];

      const tq = createTemporalWithPatches(patches);

      const result = await tq.eventually(
        'X',
        (n) => n.props.status === 'merged'
      );

      expect(result).toBe(true);
    });

    it('returns false when predicate never holds', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 1,
          propKey: 'status',
          propValue: 'draft',
          sha: 'a'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 2,
          propKey: 'status',
          propValue: 'review',
          sha: 'b'.repeat(40),
        }),
      ];

      const tq = createTemporalWithPatches(patches);

      const result = await tq.eventually(
        'X',
        (n) => n.props.status === 'merged'
      );

      expect(result).toBe(false);
    });

    it('returns false when node never existed', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'Y',
          writer: 'W',
          lamport: 1,
          propKey: 'status',
          propValue: 'active',
          sha: 'a'.repeat(40),
        }),
      ];

      const tq = createTemporalWithPatches(patches);

      const result = await tq.eventually(
        'X',
        (n) => n.props.status === 'active'
      );

      expect(result).toBe(false);
    });

    it('returns false for empty patch history', async () => {
      const tq = createTemporalWithPatches([]);

      const result = await tq.eventually(
        'X',
        (n) => n.props.status === 'merged'
      );

      expect(result).toBe(false);
    });

    it('short-circuits on first true predicate', async () => {
      let callCount = 0;

      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 1,
          propKey: 'status',
          propValue: 'target',
          sha: 'a'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 2,
          propKey: 'status',
          propValue: 'other',
          sha: 'b'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 3,
          propKey: 'status',
          propValue: 'another',
          sha: 'c'.repeat(40),
        }),
      ];

      const tq = createTemporalWithPatches(patches);

      const result = await tq.eventually('X', (n) => {
        callCount++;
        return n.props.status === 'target';
      });

      expect(result).toBe(true);
      // Should only have been called once (short-circuit)
      expect(callCount).toBe(1);
    });

    it('respects the since parameter', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 1,
          propKey: 'status',
          propValue: 'target',
          sha: 'a'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 2,
          propKey: 'status',
          propValue: 'other',
          sha: 'b'.repeat(40),
        }),
      ];

      const tq = createTemporalWithPatches(patches);

      // Since 2: only tick 2 is checked, which has 'other' not 'target'
      const result = await tq.eventually(
        'X',
        (n) => n.props.status === 'target',
        { since: 2 }
      );

      expect(result).toBe(false);
    });

    it('handles single-tick history where predicate is true', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 1,
          propKey: 'status',
          propValue: 'merged',
          sha: 'a'.repeat(40),
        }),
      ];

      const tq = createTemporalWithPatches(patches);

      const result = await tq.eventually(
        'X',
        (n) => n.props.status === 'merged'
      );

      expect(result).toBe(true);
    });

    it('handles single-tick history where predicate is false', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 1,
          propKey: 'status',
          propValue: 'draft',
          sha: 'a'.repeat(40),
        }),
      ];

      const tq = createTemporalWithPatches(patches);

      const result = await tq.eventually(
        'X',
        (n) => n.props.status === 'merged'
      );

      expect(result).toBe(false);
    });

    it('defaults since to 0 when not provided', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 1,
          propKey: 'status',
          propValue: 'merged',
          sha: 'a'.repeat(40),
        }),
      ];

      const tq = createTemporalWithPatches(patches);

      const result = await tq.eventually(
        'X',
        (n) => n.props.status === 'merged'
      );

      expect(result).toBe(true);
    });
  });

  describe('acceptance criteria', () => {
    it('always(X, n => n.props.status === "active", { since: 0 }) returns true if always active', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 1,
          propKey: 'status',
          propValue: 'active',
          sha: 'a'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 2,
          propKey: 'count',
          propValue: 1,
          sha: 'b'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 3,
          propKey: 'count',
          propValue: 2,
          sha: 'c'.repeat(40),
        }),
      ];

      const tq = createTemporalWithPatches(patches);

      const result = await tq.always(
        'X',
        (n) => n.props.status === 'active',
        { since: 0 }
      );

      expect(result).toBe(true);
    });

    it('node status changes active -> inactive -> always("active") returns false', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 1,
          propKey: 'status',
          propValue: 'active',
          sha: 'a'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 2,
          propKey: 'status',
          propValue: 'inactive',
          sha: 'b'.repeat(40),
        }),
      ];

      const tq = createTemporalWithPatches(patches);

      const result = await tq.always(
        'X',
        (n) => n.props.status === 'active',
        { since: 0 }
      );

      expect(result).toBe(false);
    });

    it('eventually(X, n => n.props.status === "merged") returns true if ever merged', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 1,
          propKey: 'status',
          propValue: 'draft',
          sha: 'a'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 2,
          propKey: 'status',
          propValue: 'review',
          sha: 'b'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X',
          writer: 'W',
          lamport: 3,
          propKey: 'status',
          propValue: 'merged',
          sha: 'c'.repeat(40),
        }),
      ];

      const tq = createTemporalWithPatches(patches);

      const result = await tq.eventually(
        'X',
        (n) => n.props.status === 'merged'
      );

      expect(result).toBe(true);
    });
  });

  describe('multi-writer scenarios', () => {
    it('handles patches from multiple writers in causal order', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X',
          writer: 'A',
          lamport: 1,
          propKey: 'status',
          propValue: 'active',
          sha: 'a'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X',
          writer: 'B',
          lamport: 2,
          propKey: 'status',
          propValue: 'active',
          sha: 'b'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X',
          writer: 'A',
          lamport: 3,
          propKey: 'status',
          propValue: 'active',
          sha: 'c'.repeat(40),
        }),
      ];

      const tq = createTemporalWithPatches(patches);

      const result = await tq.always(
        'X',
        (n) => n.props.status === 'active',
        { since: 0 }
      );

      expect(result).toBe(true);
    });

    it('detects property change from concurrent writer', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X',
          writer: 'A',
          lamport: 1,
          propKey: 'status',
          propValue: 'active',
          sha: 'a'.repeat(40),
        }),
        // Writer B changes status at higher lamport => LWW wins
        createPropOnlyPatch({
          nodeId: 'X',
          writer: 'B',
          lamport: 2,
          propKey: 'status',
          propValue: 'paused',
          sha: 'b'.repeat(40),
        }),
      ];

      const tq = createTemporalWithPatches(patches);

      const result = await tq.always(
        'X',
        (n) => n.props.status === 'active',
        { since: 0 }
      );

      expect(result).toBe(false);
    });
  });
});
