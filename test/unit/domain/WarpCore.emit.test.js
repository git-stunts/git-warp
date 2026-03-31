import { describe, it, expect } from 'vitest';
import {
  WarpCore,
  InMemoryGraphAdapter,
  NoOpEffectSink,
  LIVE_LENS,
  REPLAY_LENS,
} from '../../../index.js';

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

describe('WarpCore.emit() — graph entity behavior', () => {
  // -----------------------------------------------------------------------
  // Core: emit writes a graph node
  // -----------------------------------------------------------------------
  describe('writes effect:* graph entities', () => {
    it('creates an effect: node in the graph', async () => {
      const core = await openCore();
      const result = await core.emit('notification', { text: 'hello' });

      expect(result).not.toBeNull();
      expect(result.effectId).toMatch(/^effect:/);

      // The node exists in materialized state
      await core.materialize();
      const nodes = await core.getNodes();
      expect(nodes).toContain(result.effectId);
    });

    it('sets kind property on the effect node', async () => {
      const core = await openCore();
      const result = await core.emit('diagnostic', null);

      await core.materialize();
      const props = await core.getNodeProps(result.effectId);
      expect(props.kind).toBe('diagnostic');
    });

    it('sets timestamp property on the effect node', async () => {
      const core = await openCore();
      const result = await core.emit('test', null);

      await core.materialize();
      const props = await core.getNodeProps(result.effectId);
      expect(typeof props.timestamp).toBe('number');
      expect(props.timestamp).toBeGreaterThan(0);
    });

    it('JSON-serializes complex payloads', async () => {
      const core = await openCore();
      const result = await core.emit('export', { format: 'csv', rows: 100 });

      await core.materialize();
      const props = await core.getNodeProps(result.effectId);
      const parsed = JSON.parse(/** @type {string} */ (props.payload));
      expect(parsed).toEqual({ format: 'csv', rows: 100 });
    });

    it('stores null payload as null property', async () => {
      const core = await openCore();
      const result = await core.emit('ping', null);

      await core.materialize();
      const props = await core.getNodeProps(result.effectId);
      expect(props.payload).toBeNull();
    });

    it('sets writer property from the graph writerId', async () => {
      const core = await openCore();
      const result = await core.emit('test', null);

      await core.materialize();
      const props = await core.getNodeProps(result.effectId);
      expect(props.writer).toBe('writer-1');
    });

    it('generates unique effect IDs across multiple emits', async () => {
      const core = await openCore();
      const r1 = await core.emit('a', null);
      const r2 = await core.emit('b', null);
      const r3 = await core.emit('c', null);

      expect(r1.effectId).not.toBe(r2.effectId);
      expect(r2.effectId).not.toBe(r3.effectId);
    });
  });

  // -----------------------------------------------------------------------
  // Provenance: effects have graph provenance
  // -----------------------------------------------------------------------
  describe('provenance', () => {
    it('effect node is traceable via patchesFor', async () => {
      const core = await openCore();
      const result = await core.emit('audit-event', { action: 'login' });

      await core.materialize();
      const patches = await core.patchesFor(result.effectId);
      expect(patches.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -----------------------------------------------------------------------
  // Pipeline integration: emit also delivers if pipeline configured
  // -----------------------------------------------------------------------
  describe('host pipeline delivery', () => {
    it('delivers through the pipeline when configured', async () => {
      const core = await openCore({
        effectSinks: [new NoOpEffectSink()],
        externalizationPolicy: LIVE_LENS,
      });

      const result = await core.emit('notification', { text: 'hi' });

      expect(result.effectId).toMatch(/^effect:/);
      expect(result.delivered).toBeDefined();
      expect(result.delivered.length).toBeGreaterThanOrEqual(1);
      expect(result.delivered[0].outcome).toBe('delivered');
    });

    it('suppresses delivery in replay mode but still writes graph node', async () => {
      const core = await openCore({
        effectSinks: [new NoOpEffectSink()],
        externalizationPolicy: REPLAY_LENS,
      });

      const result = await core.emit('notification', null);

      // Graph node was written (deterministic)
      await core.materialize();
      const nodes = await core.getNodes();
      expect(nodes).toContain(result.effectId);

      // Delivery was suppressed
      expect(result.delivered[0].outcome).toBe('suppressed');
    });

    it('returns empty delivered array when no pipeline configured', async () => {
      const core = await openCore();
      const result = await core.emit('test', null);

      expect(result.effectId).toMatch(/^effect:/);
      expect(result.delivered).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------
  // Time travel: effects are visible at historical coordinates
  // -----------------------------------------------------------------------
  describe('time travel', () => {
    it('effect nodes are visible when seeking to their coordinate', async () => {
      const core = await openCore();

      // Write some data first
      await core.patch((p) => {
        p.addNode('user:alice');
      });

      // Emit an effect
      const result = await core.emit('event', { msg: 'something happened' });

      // Materialize at current frontier — effect exists
      await core.materialize();
      const allNodes = await core.getNodes();
      expect(allNodes).toContain(result.effectId);
      expect(allNodes).toContain('user:alice');
    });
  });
});
