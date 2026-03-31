import { describe, it, expect } from 'vitest';
import EffectSinkPort from '../../../src/ports/EffectSinkPort.js';

describe('EffectSinkPort', () => {
  it('throws on unimplemented id getter', () => {
    const port = new EffectSinkPort();
    expect(() => port.id).toThrow('not implemented');
  });

  it('throws on unimplemented deliver()', async () => {
    const port = new EffectSinkPort();
    await expect(port.deliver({}, {})).rejects.toThrow('not implemented');
  });
});
