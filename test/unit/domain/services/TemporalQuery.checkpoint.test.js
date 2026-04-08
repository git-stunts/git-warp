import { describe, it, expect, vi } from 'vitest';
import { TemporalQuery } from '../../../../src/domain/services/TemporalQuery.js';
import { createEmptyStateV5, join as joinPatch } from '../../../../src/domain/services/JoinReducer.js';
import {
  createNodeAddV2,
  createPropSetV2,
  createPatch,
  createDot,
  createInlineValue,
} from '../../../helpers/warpGraphTestUtils.js';

/**
 * @typedef {import('../../../../src/domain/types/Patch.ts').default} TestPatch
 */

/**
 * Creates a patch that adds a node and sets a property on it.
 *
 * @param {Object} options
 * @param {string} options.nodeId - Node ID
 * @param {string} options.writer - Writer ID
 * @param {number} options.lamport - Lamport timestamp
 * @param {string} options.propKey - Property key
 * @param {unknown} options.propValue - Property value
 * @param {string} options.sha - Patch SHA
 * @param {boolean} [options.addNode] - Whether to include a NodeAdd op
 * @returns {{patch: TestPatch, sha: string}}
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
    patch: createPatch({ writer, lamport, ops }),
    sha,
  };
}

/**
 * Creates a property-only patch (no NodeAdd).
 *
 * @param {Object} options
 * @param {string} options.nodeId
 * @param {string} options.writer
 * @param {number} options.lamport
 * @param {string} options.propKey
 * @param {unknown} options.propValue
 * @param {string} options.sha
 * @returns {{patch: TestPatch, sha: string}}
 */
function createPropOnlyPatch({ nodeId, writer, lamport, propKey, propValue, sha }) {
  return {
    patch: createPatch({
      writer,
      lamport,
      ops: [createPropSetV2(nodeId, propKey, createInlineValue(propValue))],
    }),
    sha,
  };
}

/**
 * Builds a checkpoint state by replaying patches through JoinReducer.
 *
 * @param {Array<{patch: TestPatch, sha: string}>} patches - Patches to replay
 * @returns {import('../../../../src/domain/services/JoinReducer.js').WarpStateV5}
 */
function buildStateFromPatches(patches) {
  const state = createEmptyStateV5();
  for (const { patch, sha } of patches) {
    joinPatch(state, patch, sha);
  }
  return state;
}

describe('TemporalQuery checkpoint acceleration', () => {
  describe('always() with checkpoint', () => {
    it('skips patches covered by checkpoint when since > 0', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X', writer: 'W', lamport: 1,
          propKey: 'status', propValue: 'draft',
          sha: 'a'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X', writer: 'W', lamport: 2,
          propKey: 'status', propValue: 'active',
          sha: 'b'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X', writer: 'W', lamport: 3,
          propKey: 'status', propValue: 'active',
          sha: 'c'.repeat(40),
        }),
      ];

      // Checkpoint covers lamport 1 (maxLamport=1)
      const ckState = buildStateFromPatches(patches.slice(0, 1));
      const loadCheckpoint = vi.fn().mockResolvedValue({
        state: ckState,
        maxLamport: 1,
      });

      const tq = new TemporalQuery({
        loadAllPatches: async () => patches,
        loadCheckpoint,
      });

      // since=2 and checkpoint maxLamport=1 <= 2 => use checkpoint
      const result = await tq.always(
        'X',
        (/** @type {any} */ n) => n.props.status === 'active',
        { since: 2 },
      );

      expect(result).toBe(true);
      expect(loadCheckpoint).toHaveBeenCalledOnce();
    });

    it('produces identical results with and without checkpoint', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X', writer: 'W', lamport: 1,
          propKey: 'status', propValue: 'draft',
          sha: 'a'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X', writer: 'W', lamport: 2,
          propKey: 'status', propValue: 'active',
          sha: 'b'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X', writer: 'W', lamport: 3,
          propKey: 'status', propValue: 'active',
          sha: 'c'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X', writer: 'W', lamport: 4,
          propKey: 'status', propValue: 'inactive',
          sha: 'd'.repeat(40),
        }),
      ];

      // Without checkpoint
      const tqPlain = new TemporalQuery({
        loadAllPatches: async () => patches,
      });

      // With checkpoint covering lamport 1
      const ckState = buildStateFromPatches(patches.slice(0, 1));
      const tqAccel = new TemporalQuery({
        loadAllPatches: async () => patches,
        loadCheckpoint: async () => ({ state: ckState, maxLamport: 1 }),
      });

      for (const since of [0, 1, 2, 3, 4, 5]) {
        const plain = await tqPlain.always(
          'X',
          (/** @type {any} */ n) => n.props.status === 'active',
          { since },
        );
        const accel = await tqAccel.always(
          'X',
          (/** @type {any} */ n) => n.props.status === 'active',
          { since },
        );
        expect(accel).toBe(plain);
      }
    });

    it('falls back gracefully when loadCheckpoint returns null', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X', writer: 'W', lamport: 1,
          propKey: 'status', propValue: 'active',
          sha: 'a'.repeat(40),
        }),
      ];

      const loadCheckpoint = vi.fn().mockResolvedValue(null);

      const tq = new TemporalQuery({
        loadAllPatches: async () => patches,
        loadCheckpoint,
      });

      const result = await tq.always(
        'X',
        (/** @type {any} */ n) => n.props.status === 'active',
        { since: 1 },
      );

      expect(result).toBe(true);
      expect(loadCheckpoint).toHaveBeenCalledOnce();
    });

    it('does not consult checkpoint when since === 0', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X', writer: 'W', lamport: 1,
          propKey: 'status', propValue: 'active',
          sha: 'a'.repeat(40),
        }),
      ];

      const loadCheckpoint = vi.fn().mockResolvedValue({
        state: buildStateFromPatches(patches),
        maxLamport: 1,
      });

      const tq = new TemporalQuery({
        loadAllPatches: async () => patches,
        loadCheckpoint,
      });

      await tq.always(
        'X',
        (/** @type {any} */ n) => n.props.status === 'active',
        { since: 0 },
      );

      expect(loadCheckpoint).not.toHaveBeenCalled();
    });

    it('does not consult checkpoint when loadCheckpoint is absent', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X', writer: 'W', lamport: 1,
          propKey: 'status', propValue: 'active',
          sha: 'a'.repeat(40),
        }),
      ];

      const tq = new TemporalQuery({
        loadAllPatches: async () => patches,
      });

      const result = await tq.always(
        'X',
        (/** @type {any} */ n) => n.props.status === 'active',
        { since: 1 },
      );

      expect(result).toBe(true);
    });
  });

  describe('eventually() with checkpoint', () => {
    it('skips patches covered by checkpoint when since > 0', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X', writer: 'W', lamport: 1,
          propKey: 'status', propValue: 'draft',
          sha: 'a'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X', writer: 'W', lamport: 2,
          propKey: 'status', propValue: 'review',
          sha: 'b'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X', writer: 'W', lamport: 3,
          propKey: 'status', propValue: 'merged',
          sha: 'c'.repeat(40),
        }),
      ];

      const ckState = buildStateFromPatches(patches.slice(0, 1));
      const loadCheckpoint = vi.fn().mockResolvedValue({
        state: ckState,
        maxLamport: 1,
      });

      const tq = new TemporalQuery({
        loadAllPatches: async () => patches,
        loadCheckpoint,
      });

      const result = await tq.eventually(
        'X',
        (/** @type {any} */ n) => n.props.status === 'merged',
        { since: 2 },
      );

      expect(result).toBe(true);
      expect(loadCheckpoint).toHaveBeenCalledOnce();
    });

    it('produces identical results with and without checkpoint', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X', writer: 'W', lamport: 1,
          propKey: 'status', propValue: 'draft',
          sha: 'a'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X', writer: 'W', lamport: 2,
          propKey: 'status', propValue: 'review',
          sha: 'b'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X', writer: 'W', lamport: 3,
          propKey: 'status', propValue: 'merged',
          sha: 'c'.repeat(40),
        }),
      ];

      const tqPlain = new TemporalQuery({
        loadAllPatches: async () => patches,
      });

      const ckState = buildStateFromPatches(patches.slice(0, 1));
      const tqAccel = new TemporalQuery({
        loadAllPatches: async () => patches,
        loadCheckpoint: async () => ({ state: ckState, maxLamport: 1 }),
      });

      for (const since of [0, 1, 2, 3, 4]) {
        const plain = await tqPlain.eventually(
          'X',
          (/** @type {any} */ n) => n.props.status === 'merged',
          { since },
        );
        const accel = await tqAccel.eventually(
          'X',
          (/** @type {any} */ n) => n.props.status === 'merged',
          { since },
        );
        expect(accel).toBe(plain);
      }
    });

    it('falls back gracefully when loadCheckpoint returns null', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X', writer: 'W', lamport: 1,
          propKey: 'status', propValue: 'merged',
          sha: 'a'.repeat(40),
        }),
      ];

      const loadCheckpoint = vi.fn().mockResolvedValue(null);

      const tq = new TemporalQuery({
        loadAllPatches: async () => patches,
        loadCheckpoint,
      });

      const result = await tq.eventually(
        'X',
        (/** @type {any} */ n) => n.props.status === 'merged',
        { since: 1 },
      );

      expect(result).toBe(true);
      expect(loadCheckpoint).toHaveBeenCalledOnce();
    });

    it('does not consult checkpoint when since === 0', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X', writer: 'W', lamport: 1,
          propKey: 'status', propValue: 'merged',
          sha: 'a'.repeat(40),
        }),
      ];

      const loadCheckpoint = vi.fn().mockResolvedValue({
        state: buildStateFromPatches(patches),
        maxLamport: 1,
      });

      const tq = new TemporalQuery({
        loadAllPatches: async () => patches,
        loadCheckpoint,
      });

      await tq.eventually(
        'X',
        (/** @type {any} */ n) => n.props.status === 'merged',
        { since: 0 },
      );

      expect(loadCheckpoint).not.toHaveBeenCalled();
    });
  });

  describe('checkpoint maxLamport boundary', () => {
    it('does not mutate reused checkpoint state across independent queries', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X', writer: 'W', lamport: 1,
          propKey: 'status', propValue: 'draft',
          sha: 'a'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X', writer: 'W', lamport: 2,
          propKey: 'status', propValue: 'active',
          sha: 'b'.repeat(40),
        }),
      ];

      const checkpoint = {
        state: buildStateFromPatches(patches.slice(0, 1)),
        maxLamport: 1,
      };
      const loadCheckpoint = vi.fn().mockResolvedValue(checkpoint);
      const tq = new TemporalQuery({
        loadAllPatches: async () => patches,
        loadCheckpoint,
      });

      // First query replays lamport 2 and must not mutate shared checkpoint state.
      await expect(tq.eventually(
        'X',
        (/** @type {any} */ n) => n.props.status === 'active',
        { since: 2 },
      )).resolves.toBe(true);

      // Second query depends on checkpoint boundary snapshot still being "draft".
      await expect(tq.eventually(
        'X',
        (/** @type {any} */ n) => n.props.status === 'draft',
        { since: 1 },
      )).resolves.toBe(true);

      expect(loadCheckpoint).toHaveBeenCalledTimes(2);
    });

    it('skips checkpoint when maxLamport > since', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X', writer: 'W', lamport: 1,
          propKey: 'status', propValue: 'active',
          sha: 'a'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X', writer: 'W', lamport: 2,
          propKey: 'status', propValue: 'active',
          sha: 'b'.repeat(40),
        }),
      ];

      // Checkpoint covers up to lamport 2, but since=1
      // maxLamport(2) > since(1) => cannot use checkpoint
      const loadCheckpoint = vi.fn().mockResolvedValue({
        state: buildStateFromPatches(patches),
        maxLamport: 2,
      });

      const tq = new TemporalQuery({
        loadAllPatches: async () => patches,
        loadCheckpoint,
      });

      const result = await tq.always(
        'X',
        (/** @type {any} */ n) => n.props.status === 'active',
        { since: 1 },
      );

      expect(result).toBe(true);
      // loadCheckpoint was called but its result was not used (maxLamport > since)
      expect(loadCheckpoint).toHaveBeenCalledOnce();
    });

    it('always() evaluates predicate at checkpoint boundary when maxLamport === since', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X', writer: 'W', lamport: 1,
          propKey: 'status', propValue: 'draft',
          sha: 'a'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X', writer: 'W', lamport: 2,
          propKey: 'status', propValue: 'active',
          sha: 'b'.repeat(40),
        }),
      ];

      const loadCheckpoint = vi.fn().mockResolvedValue({
        state: buildStateFromPatches(patches.slice(0, 1)),
        maxLamport: 1,
      });

      const tq = new TemporalQuery({
        loadAllPatches: async () => patches,
        loadCheckpoint,
      });

      const result = await tq.always(
        'X',
        (/** @type {any} */ n) => n.props.status === 'active',
        { since: 1 },
      );

      expect(result).toBe(false);
      expect(loadCheckpoint).toHaveBeenCalledOnce();
    });

    it('always() evaluates checkpoint when allPatches is empty (startIdx===0)', async () => {
      // Checkpoint covers all patches — allPatches is empty after filtering
      // so findIndex returns -1, startIdx = allPatches.length = 0.
      // The checkpoint state must still be evaluated.
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X', writer: 'W', lamport: 1,
          propKey: 'status', propValue: 'active',
          sha: 'a'.repeat(40),
        }),
      ];

      const tq = new TemporalQuery({
        loadAllPatches: async () => [],
        loadCheckpoint: async () => ({
          state: buildStateFromPatches(patches),
          maxLamport: 1,
        }),
      });

      // since=1 matches checkpoint maxLamport; node exists with status=active
      const result = await tq.always(
        'X',
        (/** @type {any} */ n) => n.props.status === 'active',
        { since: 1 },
      );

      expect(result).toBe(true);
    });

    it('eventually() evaluates checkpoint when allPatches is empty (startIdx===0)', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X', writer: 'W', lamport: 1,
          propKey: 'status', propValue: 'found',
          sha: 'a'.repeat(40),
        }),
      ];

      const tq = new TemporalQuery({
        loadAllPatches: async () => [],
        loadCheckpoint: async () => ({
          state: buildStateFromPatches(patches),
          maxLamport: 1,
        }),
      });

      const result = await tq.eventually(
        'X',
        (/** @type {any} */ n) => n.props.status === 'found',
        { since: 1 },
      );

      expect(result).toBe(true);
    });

    it('eventually() evaluates checkpoint boundary state when maxLamport === since', async () => {
      const patches = [
        createNodeWithPropPatch({
          nodeId: 'X', writer: 'W', lamport: 1,
          propKey: 'status', propValue: 'draft',
          sha: 'a'.repeat(40),
        }),
        createPropOnlyPatch({
          nodeId: 'X', writer: 'W', lamport: 2,
          propKey: 'status', propValue: 'active',
          sha: 'b'.repeat(40),
        }),
      ];

      const tq = new TemporalQuery({
        loadAllPatches: async () => patches,
        loadCheckpoint: async () => ({
          state: buildStateFromPatches(patches.slice(0, 1)),
          maxLamport: 1,
        }),
      });

      const result = await tq.eventually(
        'X',
        (/** @type {any} */ n) => n.props.status === 'draft',
        { since: 1 },
      );

      expect(result).toBe(true);
    });
  });
});
