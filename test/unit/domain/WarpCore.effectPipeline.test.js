import { describe, it, expect, vi } from 'vitest';
import {
  WarpCore,
  InMemoryGraphAdapter,
  EffectPipeline,
  MultiplexSink,
  NoOpEffectSink,
  ConsoleEffectSink,
  LIVE_LENS,
  REPLAY_LENS,
  INSPECT_LENS,
} from '../../../index.js';

/**
 * Helper: open a WarpCore with an InMemoryGraphAdapter.
 *
 * @param {Record<string, unknown>} [extra]
 * @returns {Promise<WarpCore>}
 */
async function openCore(extra = {}) {
  return await WarpCore.open({
    persistence: new InMemoryGraphAdapter(),
    graphName: 'effect-test',
    writerId: 'writer-1',
    ...extra,
  });
}

describe('WarpCore — effect pipeline integration', () => {
  // -----------------------------------------------------------------------
  // No pipeline configured (backward compatible)
  // -----------------------------------------------------------------------
  describe('no pipeline configured', () => {
    it('effectPipeline is null by default', async () => {
      const core = await openCore();
      expect(core.effectPipeline).toBeNull();
    });

    it('effectEmissions returns empty array', async () => {
      const core = await openCore();
      expect(core.effectEmissions).toEqual([]);
    });

    it('deliveryObservations returns empty array', async () => {
      const core = await openCore();
      expect(core.deliveryObservations).toEqual([]);
    });

    it('externalizationPolicy returns null', async () => {
      const core = await openCore();
      expect(core.externalizationPolicy).toBeNull();
    });

    it('emit() is a no-op and returns null', async () => {
      const core = await openCore();
      const result = await core.emit('test', { data: 1 });
      expect(result).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Pipeline injected via open()
  // -----------------------------------------------------------------------
  describe('effectPipeline option', () => {
    it('accepts a pre-built EffectPipeline', async () => {
      const mux = new MultiplexSink();
      mux.addSink(new NoOpEffectSink());
      const pipeline = new EffectPipeline({
        sink: mux,
        lens: LIVE_LENS,
        clock: { now: () => 42 },
      });

      const core = await openCore({ effectPipeline: pipeline });
      expect(core.effectPipeline).toBe(pipeline);
    });
  });

  // -----------------------------------------------------------------------
  // effectSinks + externalizationPolicy auto-construction
  // -----------------------------------------------------------------------
  describe('effectSinks + externalizationPolicy options', () => {
    it('auto-constructs an EffectPipeline from sinks and lens', async () => {
      const core = await openCore({
        effectSinks: [new NoOpEffectSink()],
        externalizationPolicy: LIVE_LENS,
      });

      expect(core.effectPipeline).toBeInstanceOf(EffectPipeline);
      expect(core.externalizationPolicy).toBe(LIVE_LENS);
    });

    it('registers all provided sinks in the multiplex', async () => {
      const s1 = new NoOpEffectSink({ id: 'sink-a' });
      const s2 = new NoOpEffectSink({ id: 'sink-b' });

      const core = await openCore({
        effectSinks: [s1, s2],
        externalizationPolicy: LIVE_LENS,
      });

      const result = await core.emit('test', null);
      expect(result.observations).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // core.emit()
  // -----------------------------------------------------------------------
  describe('emit()', () => {
    it('emits an effect and returns emission + observations', async () => {
      const core = await openCore({
        effectSinks: [new NoOpEffectSink()],
        externalizationPolicy: LIVE_LENS,
      });

      const result = await core.emit('notification', { text: 'hello' });

      expect(result.emission.kind).toBe('notification');
      expect(result.emission.payload).toEqual({ text: 'hello' });
      expect(result.observations).toHaveLength(1);
      expect(result.observations[0].outcome).toBe('delivered');
    });

    it('passes writer and coordinate options through', async () => {
      const core = await openCore({
        effectSinks: [new NoOpEffectSink()],
        externalizationPolicy: LIVE_LENS,
      });

      const result = await core.emit('export', { format: 'csv' }, {
        writer: 'alice',
        coordinate: { frontier: { alice: 'abc' }, ceiling: 5 },
      });

      expect(result.emission.writer).toBe('alice');
      expect(result.emission.coordinate.frontier).toEqual({ alice: 'abc' });
      expect(result.emission.coordinate.ceiling).toBe(5);
    });
  });

  // -----------------------------------------------------------------------
  // Emission and observation getters
  // -----------------------------------------------------------------------
  describe('effectEmissions / deliveryObservations getters', () => {
    it('accumulates emissions across multiple emit() calls', async () => {
      const core = await openCore({
        effectSinks: [new NoOpEffectSink()],
        externalizationPolicy: LIVE_LENS,
      });

      await core.emit('a', 1);
      await core.emit('b', 2);
      await core.emit('c', 3);

      expect(core.effectEmissions).toHaveLength(3);
      expect(core.effectEmissions.map((/** @type {any} */ e) => e.kind)).toEqual([
        'a', 'b', 'c',
      ]);
    });

    it('accumulates delivery observations', async () => {
      const core = await openCore({
        effectSinks: [
          new NoOpEffectSink({ id: 'sink-1' }),
          new NoOpEffectSink({ id: 'sink-2' }),
        ],
        externalizationPolicy: LIVE_LENS,
      });

      await core.emit('test', null);
      // 2 sinks × 1 emission = 2 observations
      expect(core.deliveryObservations).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // Delivery lens get/set
  // -----------------------------------------------------------------------
  describe('externalizationPolicy get/set', () => {
    it('exposes the current delivery lens', async () => {
      const core = await openCore({
        effectSinks: [new NoOpEffectSink()],
        externalizationPolicy: LIVE_LENS,
      });

      expect(core.externalizationPolicy).toBe(LIVE_LENS);
    });

    it('allows switching the delivery lens', async () => {
      const core = await openCore({
        effectSinks: [new NoOpEffectSink()],
        externalizationPolicy: LIVE_LENS,
      });

      core.externalizationPolicy = REPLAY_LENS;
      expect(core.externalizationPolicy).toBe(REPLAY_LENS);

      const result = await core.emit('test', null);
      expect(result.observations[0].outcome).toBe('suppressed');
    });
  });

  // -----------------------------------------------------------------------
  // Replay scenario
  // -----------------------------------------------------------------------
  describe('replay scenario', () => {
    it('emissions still appear during replay, sinks record suppression', async () => {
      const core = await openCore({
        effectSinks: [new NoOpEffectSink()],
        externalizationPolicy: REPLAY_LENS,
      });

      const result = await core.emit('notification', { msg: 'hi' });

      // Emission exists (deterministic)
      expect(result.emission.kind).toBe('notification');
      expect(result.emission.payload).toEqual({ msg: 'hi' });

      // But delivery was suppressed
      expect(result.observations[0].outcome).toBe('suppressed');
      expect(result.observations[0].reason).toContain('replay');
      expect(result.observations[0].lens.mode).toBe('replay');
    });

    it('switching from live to replay mid-session changes delivery behavior', async () => {
      const core = await openCore({
        effectSinks: [new NoOpEffectSink()],
        externalizationPolicy: LIVE_LENS,
      });

      const r1 = await core.emit('before', null);
      expect(r1.observations[0].outcome).toBe('delivered');

      core.externalizationPolicy = REPLAY_LENS;

      const r2 = await core.emit('after', null);
      expect(r2.observations[0].outcome).toBe('suppressed');

      // Both emissions exist in the log
      expect(core.effectEmissions).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // Post-construction pipeline assignment
  // -----------------------------------------------------------------------
  describe('post-construction pipeline assignment', () => {
    it('allows setting effectPipeline after open()', async () => {
      const core = await openCore();
      expect(core.effectPipeline).toBeNull();

      const mux = new MultiplexSink();
      mux.addSink(new NoOpEffectSink());
      core.effectPipeline = new EffectPipeline({
        sink: mux,
        lens: LIVE_LENS,
        clock: { now: () => 99 },
      });

      expect(core.effectPipeline).toBeInstanceOf(EffectPipeline);

      const result = await core.emit('late-bind', null);
      expect(result.emission.kind).toBe('late-bind');
    });
  });
});
