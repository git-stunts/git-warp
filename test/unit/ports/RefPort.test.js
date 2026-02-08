import { describe, it, expect } from 'vitest';
import RefPort from '../../../src/ports/RefPort.js';

describe('RefPort', () => {
  it('throws on direct call to updateRef()', async () => {
    const port = new RefPort();
    await expect(port.updateRef('refs/heads/main', 'abc123')).rejects.toThrow('not implemented');
  });

  it('throws on direct call to readRef()', async () => {
    const port = new RefPort();
    await expect(port.readRef('refs/heads/main')).rejects.toThrow('not implemented');
  });

  it('throws on direct call to deleteRef()', async () => {
    const port = new RefPort();
    await expect(port.deleteRef('refs/heads/main')).rejects.toThrow('not implemented');
  });
});
