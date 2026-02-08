import { describe, it, expect } from 'vitest';
import BlobPort from '../../../src/ports/BlobPort.js';

describe('BlobPort', () => {
  it('throws on direct call to writeBlob()', async () => {
    const port = new BlobPort();
    await expect(port.writeBlob('content')).rejects.toThrow('not implemented');
  });

  it('throws on direct call to readBlob()', async () => {
    const port = new BlobPort();
    await expect(port.readBlob('abc123')).rejects.toThrow('not implemented');
  });
});
