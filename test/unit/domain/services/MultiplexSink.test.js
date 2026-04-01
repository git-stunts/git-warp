import { describe, it, expect } from 'vitest';
import { MultiplexSink } from '../../../../src/domain/services/MultiplexSink.js';
import { createEffectEmission } from '../../../../src/domain/types/EffectEmission.js';
import { LIVE_LENS, REPLAY_LENS } from '../../../../src/domain/types/ExternalizationPolicy.js';
import EffectSinkPort from '../../../../src/ports/EffectSinkPort.js';

/** @returns {import('../../../../src/domain/types/EffectEmission.js').EffectEmission} */
function makeEmission(id = 'em-1') {
  return createEffectEmission({
    id,
    kind: 'test',
    payload: null,
    timestamp: 0,
    writer: null,
    coordinate: { frontier: null, ceiling: null },
  });
}

class StubSink extends EffectSinkPort {
  /** @param {string} sinkId */
  constructor(sinkId) {
    super();
    this._id = sinkId;
    /** @type {Array<{emission: unknown, lens: unknown}>} */
    this.calls = [];
  }

  get id() {
    return this._id;
  }

  /** @param {unknown} emission @param {unknown} lens */
  async deliver(emission, lens) {
    this.calls.push({ emission, lens });
    const { createDeliveryObservation } = await import(
      '../../../../src/domain/types/DeliveryObservation.js'
    );
    return createDeliveryObservation({
      emissionId: /** @type {any} */ (emission).id,
      sinkId: this._id,
      outcome: 'delivered',
      timestamp: Date.now(),
      lens: /** @type {any} */ (lens),
    });
  }
}

class FailingSink extends EffectSinkPort {
  get id() {
    return 'failing';
  }

  /** @param {unknown} emission @param {unknown} lens */
  async deliver(emission, lens) {
    const { createDeliveryObservation } = await import(
      '../../../../src/domain/types/DeliveryObservation.js'
    );
    return createDeliveryObservation({
      emissionId: /** @type {any} */ (emission).id,
      sinkId: 'failing',
      outcome: 'failed',
      reason: 'boom',
      timestamp: Date.now(),
      lens: /** @type {any} */ (lens),
    });
  }
}

describe('MultiplexSink', () => {
  // -----------------------------------------------------------------------
  // Construction & identity
  // -----------------------------------------------------------------------
  it('has id "multiplex" by default', () => {
    const mux = new MultiplexSink();
    expect(mux.id).toBe('multiplex');
  });

  it('accepts a custom id', () => {
    const mux = new MultiplexSink({ id: 'custom-mux' });
    expect(mux.id).toBe('custom-mux');
  });

  // -----------------------------------------------------------------------
  // Sink management
  // -----------------------------------------------------------------------
  it('starts with no sinks', () => {
    const mux = new MultiplexSink();
    expect(mux.sinks).toEqual([]);
  });

  it('adds sinks', () => {
    const mux = new MultiplexSink();
    const s1 = new StubSink('a');
    const s2 = new StubSink('b');
    mux.addSink(s1);
    mux.addSink(s2);
    expect(mux.sinks).toHaveLength(2);
  });

  it('rejects duplicate sink ids', () => {
    const mux = new MultiplexSink();
    mux.addSink(new StubSink('a'));
    expect(() => mux.addSink(new StubSink('a'))).toThrow('duplicate');
  });

  it('removes sinks by id', () => {
    const mux = new MultiplexSink();
    mux.addSink(new StubSink('a'));
    mux.addSink(new StubSink('b'));
    mux.removeSink('a');
    expect(mux.sinks).toHaveLength(1);
    expect(/** @type {*} */ (mux.sinks[0]).id).toBe('b');
  });

  it('returns false when removing nonexistent sink', () => {
    const mux = new MultiplexSink();
    expect(mux.removeSink('ghost')).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Delivery fan-out
  // -----------------------------------------------------------------------
  it('delivers to all child sinks and returns observations', async () => {
    const mux = new MultiplexSink();
    const s1 = new StubSink('a');
    const s2 = new StubSink('b');
    mux.addSink(s1);
    mux.addSink(s2);

    const emission = makeEmission();
    const observations = await mux.deliver(emission, LIVE_LENS);

    expect(observations).toHaveLength(2);
    expect(/** @type {*} */ (observations[0]).sinkId).toBe('a');
    expect(/** @type {*} */ (observations[1]).sinkId).toBe('b');
    expect(s1.calls).toHaveLength(1);
    expect(s2.calls).toHaveLength(1);
  });

  it('returns empty array with no sinks', async () => {
    const mux = new MultiplexSink();
    const emission = makeEmission();
    const observations = await mux.deliver(emission, LIVE_LENS);
    expect(observations).toEqual([]);
  });

  it('collects observations from mixed success/failure', async () => {
    const mux = new MultiplexSink();
    mux.addSink(new StubSink('ok'));
    mux.addSink(new FailingSink());

    const emission = makeEmission();
    const observations = await mux.deliver(emission, LIVE_LENS);

    expect(observations).toHaveLength(2);
    const outcomes = observations.map((/** @type {any} */ o) => o.outcome);
    expect(outcomes).toContain('delivered');
    expect(outcomes).toContain('failed');
  });

  it('passes the externalization policy to each child sink', async () => {
    const mux = new MultiplexSink();
    const stub = new StubSink('spy');
    mux.addSink(stub);

    const emission = makeEmission();
    await mux.deliver(emission, REPLAY_LENS);

    expect(/** @type {*} */ (stub.calls[0]).lens).toBe(REPLAY_LENS);
  });
});
