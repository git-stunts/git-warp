import { describe, it, expect } from 'vitest';
import EffectSinkPort from '../../../src/ports/EffectSinkPort.ts';

describe('EffectSinkPort', () => {
  it('abstract members are not callable on base prototype', () => {
    expect(EffectSinkPort.prototype.deliver).toBeUndefined();
    // id is an abstract getter — not on prototype
    expect(Object.getOwnPropertyDescriptor(EffectSinkPort.prototype, 'id')).toBeUndefined();
  });

  it('concrete subclass satisfies the contract', async () => {
    class TestSink extends EffectSinkPort {
      get id() { return 'test-sink'; }
      async deliver() { return /** @type {any} */ ({ outcome: 'delivered' }); }
    }
    const sink = new TestSink();
    expect(sink).toBeInstanceOf(EffectSinkPort);
    expect(sink.id).toBe('test-sink');
  });
});
