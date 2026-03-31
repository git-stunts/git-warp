import { describe, it, expect } from 'vitest';
import { NoOpEffectSink } from '../../../../src/infrastructure/adapters/NoOpEffectSink.js';
import { createEffectEmission } from '../../../../src/domain/types/EffectEmission.js';
import { LIVE_LENS, REPLAY_LENS } from '../../../../src/domain/types/DeliveryLens.js';
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

describe('NoOpEffectSink', () => {
  it('is an EffectSinkPort', () => {
    const sink = new NoOpEffectSink();
    expect(sink).toBeInstanceOf(EffectSinkPort);
  });

  it('has id "noop"', () => {
    const sink = new NoOpEffectSink();
    expect(sink.id).toBe('noop');
  });

  it('accepts a custom id', () => {
    const sink = new NoOpEffectSink({ id: 'test-noop' });
    expect(sink.id).toBe('test-noop');
  });

  it('always returns delivered in live mode', async () => {
    const sink = new NoOpEffectSink();
    const obs = await sink.deliver(makeEmission(), LIVE_LENS);

    expect(obs.outcome).toBe('delivered');
    expect(obs.sinkId).toBe('noop');
    expect(obs.emissionId).toBe('em-1');
  });

  it('returns suppressed in replay mode with suppressExternal', async () => {
    const sink = new NoOpEffectSink();
    const obs = await sink.deliver(makeEmission(), REPLAY_LENS);

    expect(obs.outcome).toBe('suppressed');
    expect(obs.reason).toContain('replay');
  });
});
