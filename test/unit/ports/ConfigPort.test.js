import { describe, it, expect } from 'vitest';
import ConfigPort from '../../../src/ports/ConfigPort.ts';

describe('ConfigPort', () => {
  it('abstract methods are not callable on base prototype', () => {
    expect(ConfigPort.prototype.configGet).toBeUndefined();
    expect(ConfigPort.prototype.configSet).toBeUndefined();
  });

  it('concrete subclass satisfies the contract', async () => {
    class TestConfig extends ConfigPort {
      async configGet() { return 'value'; }
      async configSet() { /* no-op */ }
    }
    const cfg = new TestConfig();
    expect(cfg).toBeInstanceOf(ConfigPort);
    expect(await cfg.configGet('key')).toBe('value');
  });
});
