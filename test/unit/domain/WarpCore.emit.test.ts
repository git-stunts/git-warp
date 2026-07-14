import { describe, it, expect } from 'vitest';
import { openMemoryWarpCore } from '../../helpers/MemoryRuntimeHost.ts';
import type WarpCore from '../../../src/domain/WarpCore.ts';
import InMemoryGraphAdapter from '../../../test/helpers/InMemoryGraphAdapter.ts';
import { EFFECT_NODE_PREFIX } from '../../../src/domain/services/KeyCodec.ts';

type WarpCoreWired = Awaited<ReturnType<typeof WarpCore.open>>;

async function openCore(extra = {}): Promise<WarpCoreWired> {
  return (await openMemoryWarpCore({
    persistence: new InMemoryGraphAdapter(),
    graphName: 'emit-test',
    writerId: 'writer-1',
    ...extra,
  })) as WarpCoreWired;
}

describe('PatchBuilder.emitEffect() — graph entity behavior', () => {
  // -----------------------------------------------------------------------
  // Core: emitEffect writes a graph node inside a patch
  // -----------------------------------------------------------------------
  describe('writes effect graph entities', () => {
    it('creates a node with the effect prefix', async () => {
      const core = await openCore();
      let effectId = '' as string;
      await core.patch((p) => {
        effectId = (p as any).emitEffect('notification', { text: 'hello' });
      });

      expect(effectId.startsWith(EFFECT_NODE_PREFIX)).toBe(true);

      await core.materialize();
      const nodes = await core.getNodes();
      expect(nodes).toContain(effectId);
    });

    it('sets kind property on the effect node', async () => {
      const core = await openCore();
      let effectId = '' as string;
      await core.patch((p) => {
        effectId = (p as any).emitEffect('diagnostic', null);
      });

      await core.materialize();
      const props = await core.getNodeProps(effectId);
      if (props == null) {
        throw new Error('props should not be null');
      }
      expect(props['kind']).toBe('diagnostic');
    });

    it('sets writer property from the patch writerId', async () => {
      const core = await openCore();
      let effectId = '' as string;
      await core.patch((p) => {
        effectId = (p as any).emitEffect('test', null);
      });

      await core.materialize();
      const props = await core.getNodeProps(effectId);
      if (props == null) {
        throw new Error('props should not be null');
      }
      expect(props['writer']).toBe('writer-1');
    });

    it('canonically serializes complex payloads', async () => {
      const core = await openCore();
      let effectId = '' as string;
      await core.patch((p) => {
        effectId = (p as any).emitEffect('export', { format: 'csv', rows: 100 });
      });

      await core.materialize();
      const props = await core.getNodeProps(effectId);
      if (props == null) {
        throw new Error('props should not be null');
      }
      const parsed = JSON.parse(props['payload'] as string);
      expect(parsed).toEqual({ format: 'csv', rows: 100 });
    });

    it('does not set payload property for null payload', async () => {
      const core = await openCore();
      let effectId = '' as string;
      await core.patch((p) => {
        effectId = (p as any).emitEffect('ping', null);
      });

      await core.materialize();
      const props = await core.getNodeProps(effectId);
      if (props == null) {
        throw new Error('props should not be null');
      }
      expect(props['payload']).toBeUndefined();
    });

    it('generates unique effect IDs across multiple emits', async () => {
      const core = await openCore();
      const ids = [] as string[];
      await core.patch((p) => {
        ids.push((p as any).emitEffect('a', null));
        ids.push((p as any).emitEffect('b', null));
        ids.push((p as any).emitEffect('c', null));
      });

      expect(new Set(ids).size).toBe(3);
    });

    it('allows a custom effectId', async () => {
      const core = await openCore();
      const customId = `${EFFECT_NODE_PREFIX}my-custom-id`;
      await core.patch((p) => {
        (p as any).emitEffect('test', null, { effectId: customId });
      });

      await core.materialize();
      const nodes = await core.getNodes();
      expect(nodes).toContain(customId);
    });

    it('rejects empty kind', async () => {
      const core = await openCore();
      await expect(
        core.patch((p) => {
          (p as any).emitEffect('', null);
        })
      ).rejects.toThrow('emitEffect: kind must be a non-empty string');
    });
  });

  // -----------------------------------------------------------------------
  // Same-patch causality: effect shares provenance with its cause
  // -----------------------------------------------------------------------
  describe('same-patch causality', () => {
    it('effect and its cause share the same patch', async () => {
      const core = await openCore();
      let effectId = '' as string;
      const patchSha = await core.patch((p) => {
        p.addNode('user:alice');
        p.setProperty('user:alice', 'name', 'Alice');
        effectId = (p as any).emitEffect('user-created', { userId: 'user:alice' });
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
      let effectId = '' as string;
      await core.patch((p) => {
        effectId = (p as any).emitEffect('test', null);
      });

      await core.materialize();
      const props = await core.getNodeProps(effectId);
      if (props == null) {
        throw new Error('props should not be null');
      }
      expect(props['timestamp']).toBeUndefined();
    });

    it('canonical payload serialization is deterministic across instances', async () => {
      const core1 = await openCore();
      const core2 = (await openMemoryWarpCore({
        persistence: new InMemoryGraphAdapter(),
        graphName: 'emit-test-2',
        writerId: 'writer-1',
      })) as WarpCoreWired;

      const payload = { z: 1, a: 2, m: { b: 3, a: 4 } };
      const sharedId = `${EFFECT_NODE_PREFIX}determinism-check`;

      await core1.patch((p) => {
        (p as any).emitEffect('test', payload, { effectId: sharedId });
      });
      await core2.patch((p) => {
        (p as any).emitEffect('test', payload, { effectId: sharedId });
      });

      await core1.materialize();
      await core2.materialize();

      const props1 = await core1.getNodeProps(sharedId);
      const props2 = await core2.getNodeProps(sharedId);
      if (props1 == null || props2 == null) {
        throw new Error('props should not be null');
      }
      expect(props1['payload']).toBe(props2['payload']);
    });
  });
});
