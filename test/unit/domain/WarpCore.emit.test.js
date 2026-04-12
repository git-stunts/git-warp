import { describe, it, expect } from 'vitest';
import {
  WarpCore,
  InMemoryGraphAdapter,
} from '../../../index.js';
import { EFFECT_NODE_PREFIX } from '../../../src/domain/services/KeyCodec.ts';

/**
 * @param {Record<string, unknown>} [extra]
 * @returns {Promise<WarpCore>}
 */
async function openCore(extra = {}) {
  return await WarpCore.open({
    persistence: new InMemoryGraphAdapter(),
    graphName: 'emit-test',
    writerId: 'writer-1',
    ...extra,
  });
}

describe('PatchBuilder.emitEffect() — graph entity behavior', () => {
  // -----------------------------------------------------------------------
  // Core: emitEffect writes a graph node inside a patch
  // -----------------------------------------------------------------------
  describe('writes effect graph entities', () => {
    it('creates a node with the effect prefix', async () => {
      const core = await openCore();
      /** @type {string} */
      let effectId = '';
      await core.patch((p) => {
        effectId = /** @type {*} */ (p).emitEffect('notification', { text: 'hello' });
      });

      expect(effectId.startsWith(EFFECT_NODE_PREFIX)).toBe(true);

      await core.materialize();
      const nodes = await core.getNodes();
      expect(nodes).toContain(effectId);
    });

    it('sets kind property on the effect node', async () => {
      const core = await openCore();
      /** @type {string} */
      let effectId = '';
      await core.patch((p) => {
        effectId = /** @type {*} */ (p).emitEffect('diagnostic', null);
      });

      await core.materialize();
      const props = await core.getNodeProps(effectId);
      if (props == null) { throw new Error('props should not be null'); }
      expect(props['kind']).toBe('diagnostic');
    });

    it('sets writer property from the patch writerId', async () => {
      const core = await openCore();
      /** @type {string} */
      let effectId = '';
      await core.patch((p) => {
        effectId = /** @type {*} */ (p).emitEffect('test', null);
      });

      await core.materialize();
      const props = await core.getNodeProps(effectId);
      if (props == null) { throw new Error('props should not be null'); }
      expect(props['writer']).toBe('writer-1');
    });

    it('canonically serializes complex payloads', async () => {
      const core = await openCore();
      /** @type {string} */
      let effectId = '';
      await core.patch((p) => {
        effectId = /** @type {*} */ (p).emitEffect('export', { format: 'csv', rows: 100 });
      });

      await core.materialize();
      const props = await core.getNodeProps(effectId);
      if (props == null) { throw new Error('props should not be null'); }
      const parsed = JSON.parse(/** @type {string} */ (props['payload']));
      expect(parsed).toEqual({ format: 'csv', rows: 100 });
    });

    it('does not set payload property for null payload', async () => {
      const core = await openCore();
      /** @type {string} */
      let effectId = '';
      await core.patch((p) => {
        effectId = /** @type {*} */ (p).emitEffect('ping', null);
      });

      await core.materialize();
      const props = await core.getNodeProps(effectId);
      if (props == null) { throw new Error('props should not be null'); }
      expect(props['payload']).toBeUndefined();
    });

    it('generates unique effect IDs across multiple emits', async () => {
      const core = await openCore();
      /** @type {string[]} */
      const ids = [];
      await core.patch((p) => {
        ids.push(/** @type {*} */ (p).emitEffect('a', null));
        ids.push(/** @type {*} */ (p).emitEffect('b', null));
        ids.push(/** @type {*} */ (p).emitEffect('c', null));
      });

      expect(new Set(ids).size).toBe(3);
    });

    it('allows a custom effectId', async () => {
      const core = await openCore();
      const customId = `${EFFECT_NODE_PREFIX}my-custom-id`;
      await core.patch((p) => {
        /** @type {*} */ (p).emitEffect('test', null, { effectId: customId });
      });

      await core.materialize();
      const nodes = await core.getNodes();
      expect(nodes).toContain(customId);
    });

    it('rejects empty kind', async () => {
      const core = await openCore();
      await expect(
        core.patch((p) => {
          /** @type {*} */ (p).emitEffect('', null);
        }),
      ).rejects.toThrow('emitEffect: kind must be a non-empty string');
    });
  });

  // -----------------------------------------------------------------------
  // Same-patch causality: effect shares provenance with its cause
  // -----------------------------------------------------------------------
  describe('same-patch causality', () => {
    it('effect and its cause share the same patch', async () => {
      const core = await openCore();
      /** @type {string} */
      let effectId = '';
      const patchSha = await core.patch((p) => {
        p.addNode('user:alice');
        p.setProperty('user:alice', 'name', 'Alice');
        effectId = /** @type {*} */ (p).emitEffect('user-created', { userId: 'user:alice' });
      });

      await core.materialize();

      const nodes = await core.getNodes();
      expect(nodes).toContain('user:alice');
      expect(nodes).toContain(effectId);

      const causePatches = await core.patchesFor('user:alice');
      const effectPatches = await core.patchesFor(effectId);
      expect(causePatches).toContain(patchSha);
      expect(effectPatches).toContain(patchSha);
    });
  });

  // -----------------------------------------------------------------------
  // No wall-clock time — determinism
  // -----------------------------------------------------------------------
  describe('determinism', () => {
    it('does not set a timestamp property', async () => {
      const core = await openCore();
      /** @type {string} */
      let effectId = '';
      await core.patch((p) => {
        effectId = /** @type {*} */ (p).emitEffect('test', null);
      });

      await core.materialize();
      const props = await core.getNodeProps(effectId);
      if (props == null) { throw new Error('props should not be null'); }
      expect(props['timestamp']).toBeUndefined();
    });

    it('canonical payload serialization is deterministic across instances', async () => {
      const core1 = await openCore();
      const core2 = await WarpCore.open({
        persistence: new InMemoryGraphAdapter(),
        graphName: 'emit-test-2',
        writerId: 'writer-1',
      });

      const payload = { z: 1, a: 2, m: { b: 3, a: 4 } };
      const sharedId = `${EFFECT_NODE_PREFIX}determinism-check`;

      await core1.patch((p) => {
        /** @type {*} */ (p).emitEffect('test', payload, { effectId: sharedId });
      });
      await core2.patch((p) => {
        /** @type {*} */ (p).emitEffect('test', payload, { effectId: sharedId });
      });

      await core1.materialize();
      await core2.materialize();

      const props1 = await core1.getNodeProps(sharedId);
      const props2 = await core2.getNodeProps(sharedId);
      if (props1 == null || props2 == null) { throw new Error('props should not be null'); }
      expect(props1['payload']).toBe(props2['payload']);
    });
  });
});
