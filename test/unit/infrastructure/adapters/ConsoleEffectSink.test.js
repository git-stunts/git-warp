import { describe, it, expect, vi } from 'vitest';
import { ConsoleEffectSink } from '../../../../src/infrastructure/adapters/ConsoleEffectSink.js';
import { createEffectEmission } from '../../../../src/domain/types/EffectEmission.js';
import {
  LIVE_LENS,
  REPLAY_LENS,
  INSPECT_LENS,
} from '../../../../src/domain/types/ExternalizationPolicy.js';
import EffectSinkPort from '../../../../src/ports/EffectSinkPort.js';

/** @returns {import('../../../../src/domain/types/EffectEmission.js').EffectEmission} */
function makeEmission(id = 'em-1', kind = 'test') {
  return createEffectEmission({
    id,
    kind,
    payload: { msg: 'hello' },
    timestamp: 1000,
    writer: 'alice',
    coordinate: { frontier: null, ceiling: null },
  });
}

describe('ConsoleEffectSink', () => {
  it('is an EffectSinkPort', () => {
    const sink = new ConsoleEffectSink();
    expect(sink).toBeInstanceOf(EffectSinkPort);
  });

  it('has id "console"', () => {
    const sink = new ConsoleEffectSink();
    expect(sink.id).toBe('console');
  });

  it('logs to the provided logger in live mode', async () => {
    const info = vi.fn();
    const sink = new ConsoleEffectSink({ logger: { info } });
    const obs = await sink.deliver(makeEmission(), LIVE_LENS);

    expect(obs.outcome).toBe('delivered');
    expect(info).toHaveBeenCalledTimes(1);
  });

  it('suppresses in replay mode', async () => {
    const info = vi.fn();
    const sink = new ConsoleEffectSink({ logger: { info } });
    const obs = await sink.deliver(makeEmission(), REPLAY_LENS);

    expect(obs.outcome).toBe('suppressed');
    expect(info).not.toHaveBeenCalled();
  });

  it('suppresses in inspect mode', async () => {
    const info = vi.fn();
    const sink = new ConsoleEffectSink({ logger: { info } });
    const obs = await sink.deliver(makeEmission(), INSPECT_LENS);

    expect(obs.outcome).toBe('suppressed');
    expect(info).not.toHaveBeenCalled();
  });
});
