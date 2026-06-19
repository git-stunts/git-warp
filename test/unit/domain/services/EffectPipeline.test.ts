import { describe, it, expect, vi } from 'vitest';
import { EffectPipeline } from '../../../../src/domain/services/EffectPipeline.ts';
import { MultiplexSink } from '../../../../src/domain/services/MultiplexSink.ts';
import {
  LIVE_LENS,
  REPLAY_LENS,
  INSPECT_LENS,
} from '../../../../src/domain/types/ExternalizationPolicy.ts';
import EffectSinkPort from '../../../../src/ports/EffectSinkPort.ts';
import { createDeliveryObservation } from '../../../../src/domain/types/DeliveryObservation.ts';

class RecordingSink extends EffectSinkPort {
  _id: string;
  delivered: Array<{emission: unknown; lens: unknown}>;
  constructor(sinkId: string) {
    super();
    this._id = sinkId;
    this.delivered = [];
  }

  get id() {
    return this._id;
  }

  async deliver(emission: any, lens: any) {
    this.delivered.push({ emission, lens });
    return [createDeliveryObservation({
      emissionId: emission.id,
      sinkId: this._id,
      outcome: lens.suppressExternal ? 'suppressed' : 'delivered',
      ...(lens.suppressExternal ? { reason: `suppressed by ${lens.mode} lens` } : {}),
      timestamp: Date.now(),
      lens,
    })];
  }
}

describe('EffectPipeline', () => {
  let emitCounter = 0;
  /** @returns {{ pipeline: EffectPipeline, sink: RecordingSink }} */
  function setup(lens = LIVE_LENS) {
    const mux = new MultiplexSink();
    const sink = new RecordingSink('recorder');
    mux.addSink(sink);
    const pipeline = new EffectPipeline({ sink: mux, lens });
    emitCounter = 0;
    return { pipeline, sink };
  }

  function emitOpts() {
    emitCounter += 1;
    return { id: `emit-${emitCounter}`, timestamp: 42 };
  }

  // -----------------------------------------------------------------------
  // Emission
  // -----------------------------------------------------------------------
  describe('emit()', () => {
    it('creates an emission and delivers through the sink', async () => {
      const { pipeline, sink } = setup();
      const result = await pipeline.emit('notification', { text: 'hi' }, emitOpts());

      expect(result.emission.kind).toBe('notification');
      expect(result.emission.payload).toEqual({ text: 'hi' });
      expect(result.emission.timestamp).toBe(42);
      expect(result.observations).toHaveLength(1);
      const obs0 = result.observations[0];
      expect(obs0!.outcome).toBe('delivered');
      expect(sink.delivered).toHaveLength(1);
    });

    it('assigns unique emission IDs', async () => {
      const { pipeline } = setup();
      const r1 = await pipeline.emit('a', null, emitOpts());
      const r2 = await pipeline.emit('b', null, emitOpts());
      expect(r1.emission.id).not.toBe(r2.emission.id);
    });

    it('accepts optional writer and coordinate', async () => {
      const { pipeline } = setup();
      const result = await pipeline.emit('test', null, {
        ...emitOpts(),
        writer: 'alice',
        coordinate: { frontier: { alice: 'sha1' }, ceiling: 10 },
      });

      expect(result.emission.writer).toBe('alice');
      expect(result.emission.coordinate.frontier).toEqual({ alice: 'sha1' });
      expect(result.emission.coordinate.ceiling).toBe(10);
    });

    it('defaults writer to null and coordinate to nulls', async () => {
      const { pipeline } = setup();
      const result = await pipeline.emit('test', null, emitOpts());

      expect(result.emission.writer).toBeNull();
      expect(result.emission.coordinate.frontier).toBeNull();
      expect(result.emission.coordinate.ceiling).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Delivery lens behavior
  // -----------------------------------------------------------------------
  describe('externalization policy', () => {
    it('passes the current lens to sinks', async () => {
      const { pipeline, sink } = setup(LIVE_LENS);
      await pipeline.emit('test', null, emitOpts());
      const d0 = sink.delivered[0] as any;
      expect(d0.lens).toBe(LIVE_LENS);
    });

    it('in replay mode, sink receives replay lens', async () => {
      const { pipeline, sink } = setup(REPLAY_LENS);
      await pipeline.emit('test', null, emitOpts());
      const d0 = sink.delivered[0] as any;
      expect(d0.lens).toBe(REPLAY_LENS);
    });

    it('lens can be changed after construction', async () => {
      const { pipeline, sink } = setup(LIVE_LENS);
      await pipeline.emit('before', null, emitOpts());
      pipeline.lens = REPLAY_LENS;
      await pipeline.emit('after', null, emitOpts());

      const d0 = sink.delivered[0] as any;
      const d1 = sink.delivered[1] as any;
      expect(d0.lens.mode).toBe('live');
      expect(d1.lens.mode).toBe('replay');
    });

    it('exposes the current lens', () => {
      const { pipeline } = setup(INSPECT_LENS);
      expect(pipeline.lens).toBe(INSPECT_LENS);
    });
  });

  // -----------------------------------------------------------------------
  // Replay determinism
  // -----------------------------------------------------------------------
  describe('replay determinism', () => {
    it('still creates emissions during replay', async () => {
      const { pipeline } = setup(REPLAY_LENS);
      const result = await pipeline.emit('notification', { msg: 'hi' }, emitOpts());

      expect(result.emission.kind).toBe('notification');
      expect(result.emission.payload).toEqual({ msg: 'hi' });
    });

    it('observations record suppression during replay', async () => {
      const { pipeline } = setup(REPLAY_LENS);
      const result = await pipeline.emit('notification', null, emitOpts());

      const obs0 = result.observations[0];
      expect(obs0!.outcome).toBe('suppressed');
      expect(obs0!.reason).toContain('replay');
    });
  });

  // -----------------------------------------------------------------------
  // Emission and observation logs
  // -----------------------------------------------------------------------
  describe('logs', () => {
    it('accumulates emissions in order', async () => {
      const { pipeline } = setup();
      await pipeline.emit('a', 1, emitOpts());
      await pipeline.emit('b', 2, emitOpts());
      await pipeline.emit('c', 3, emitOpts());

      expect(pipeline.emissions).toHaveLength(3);
      expect(pipeline.emissions.map((/** @type {any} */ e) => e.kind)).toEqual([
        'a',
        'b',
        'c',
      ]);
    });

    it('accumulates observations in order', async () => {
      const { pipeline } = setup();
      await pipeline.emit('x', null, emitOpts());
      await pipeline.emit('y', null, emitOpts());

      expect(pipeline.observations).toHaveLength(2);
    });

    it('emissions log is a copy (not aliased)', async () => {
      const { pipeline } = setup();
      await pipeline.emit('a', null, emitOpts());
      const log = pipeline.emissions;
      await pipeline.emit('b', null, emitOpts());
      expect(log).toHaveLength(1);
      expect(pipeline.emissions).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------
  describe('edge cases', () => {
    it('works with no sinks (empty multiplex)', async () => {
      const mux = new MultiplexSink();
      const pipeline = new EffectPipeline({ sink: mux, lens: LIVE_LENS });
      const result = await pipeline.emit('orphan', null, { id: 'orphan-1', timestamp: 0 });

      expect(result.emission.kind).toBe('orphan');
      expect(result.observations).toEqual([]);
    });

    it('works with a direct sink (not a multiplex)', async () => {
      const sink = new RecordingSink('direct');
      const pipeline = new EffectPipeline({ sink, lens: LIVE_LENS });
      const result = await pipeline.emit('test', null, { id: 'direct-1', timestamp: 0 });

      expect(result.observations[0]?.outcome).toBe('delivered');
      expect(sink.delivered).toHaveLength(1);
    });
  });
});
