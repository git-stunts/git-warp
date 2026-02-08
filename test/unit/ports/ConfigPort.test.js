import { describe, it, expect } from 'vitest';
import ConfigPort from '../../../src/ports/ConfigPort.js';

describe('ConfigPort', () => {
  it('throws on direct call to configGet()', async () => {
    const port = new ConfigPort();
    await expect(port.configGet('warp.writerId')).rejects.toThrow('not implemented');
  });

  it('throws on direct call to configSet()', async () => {
    const port = new ConfigPort();
    await expect(port.configSet('warp.writerId', 'alice')).rejects.toThrow('not implemented');
  });
});
