import { describe, it, expect } from 'vitest';
import {
  WarpCore,
  InMemoryGraphAdapter,
  EffectPipeline,
  MultiplexSink,
  NoOpEffectSink,
  LIVE_LENS,
  REPLAY_LENS,
} from '../../../index.ts';

/**
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

describe('WarpCore — effect pipeline (host-domain infra)', () => {
  // -----------------------------------------------------------------------
  // Pipeline configuration
  // -----------------------------------------------------------------------
  describe('pipeline configuration', () => {
    it('effectPipeline is null by default', async () => {
      const core = await openCore();
      expect(core.effectPipeline).toBeNull();
    });

    it('accepts a pre-built EffectPipeline via open()', async () => {
      const mux = new MultiplexSink();
      mux.addSink(new NoOpEffectSink());
      const pipeline = new EffectPipeline({
        sink: ((mux) as any),
        lens: LIVE_LENS,
        clock: { now: () => 42 },
      });

      const core = await openCore({ effectPipeline: pipeline });
      expect(core.effectPipeline).toBe(pipeline);
    });

    it('auto-constructs pipeline from effectSinks + externalizationPolicy', async () => {
      const core = await openCore({
        effectSinks: [new NoOpEffectSink()],
        externalizationPolicy: LIVE_LENS,
      });

      expect(core.effectPipeline).toBeInstanceOf(EffectPipeline);
      expect(core.externalizationPolicy).toBe(LIVE_LENS);
    });

    it('allows setting effectPipeline after open()', async () => {
      const core = await openCore();
      expect(core.effectPipeline).toBeNull();

      const mux = new MultiplexSink();
      mux.addSink(new NoOpEffectSink());
      core.effectPipeline = new EffectPipeline({
        sink: ((mux) as any),
        lens: LIVE_LENS,
        clock: { now: () => 99 },
      });

      expect(core.effectPipeline).toBeInstanceOf(EffectPipeline);
    });
  });

  // -----------------------------------------------------------------------
  // Pipeline getters
  // -----------------------------------------------------------------------
  describe('pipeline getters', () => {
    it('effectEmissions returns empty array when no pipeline', async () => {
      const core = await openCore();
      expect(core.effectEmissions).toEqual([]);
    });

    it('deliveryObservations returns empty array when no pipeline', async () => {
      const core = await openCore();
      expect(core.deliveryObservations).toEqual([]);
    });

    it('externalizationPolicy returns null when no pipeline', async () => {
      const core = await openCore();
      expect(core.externalizationPolicy).toBeNull();
    });

    it('externalizationPolicy returns the current policy', async () => {
      const core = await openCore({
        effectSinks: [new NoOpEffectSink()],
        externalizationPolicy: LIVE_LENS,
      });
      expect(core.externalizationPolicy).toBe(LIVE_LENS);
    });

    it('allows switching the externalization policy', async () => {
      const core = await openCore({
        effectSinks: [new NoOpEffectSink()],
        externalizationPolicy: LIVE_LENS,
      });

      core.externalizationPolicy = REPLAY_LENS;
      expect(core.externalizationPolicy).toBe(REPLAY_LENS);
    });
  });

  // -----------------------------------------------------------------------
  // Pipeline used directly (host-domain, not through WarpCore.emit)
  // -----------------------------------------------------------------------
  describe('direct pipeline usage', () => {
    it('pipeline.emit() delivers through sinks', async () => {
      const core = await openCore({
        effectSinks: [new NoOpEffectSink()],
        externalizationPolicy: LIVE_LENS,
      });

      const pipeline = (core.effectPipeline as EffectPipeline);
      const result = await pipeline.emit('notification', { text: 'hi' }, { id: 'emit-1', timestamp: 42 });

      expect(result.emission.kind).toBe('notification');
      expect(result.observations).toHaveLength(1);
    });

    it('pipeline accumulates emissions and observations', async () => {
      const core = await openCore({
        effectSinks: [new NoOpEffectSink()],
        externalizationPolicy: LIVE_LENS,
      });

      const pipeline = (core.effectPipeline as EffectPipeline);
      await pipeline.emit('a', 1, { id: 'emit-a', timestamp: 1 });
      await pipeline.emit('b', 2, { id: 'emit-b', timestamp: 2 });
      await pipeline.emit('c', 3, { id: 'emit-c', timestamp: 3 });

      expect(core.effectEmissions).toHaveLength(3);
      expect(core.deliveryObservations).toHaveLength(3);
    });

    it('replay policy causes suppression in pipeline', async () => {
      const core = await openCore({
        effectSinks: [new NoOpEffectSink()],
        externalizationPolicy: REPLAY_LENS,
      });

      const pipeline = (core.effectPipeline as EffectPipeline);
      const result = await pipeline.emit('test', null, { id: 'emit-replay', timestamp: 0 });

      const obs = Array.isArray(result.observations) ? result.observations[0] : result.observations;
      expect(obs?.outcome).toBe('suppressed');
    });
  });
});
