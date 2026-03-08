import { describe, it, expect } from 'vitest';
import BlobStoragePort from '../../../src/ports/BlobStoragePort.js';

describe('BlobStoragePort', () => {
  it('store() throws not implemented', async () => {
    const port = new BlobStoragePort();
    await expect(port.store(new Uint8Array())).rejects.toThrow('not implemented');
  });

  it('retrieve() throws not implemented', async () => {
    const port = new BlobStoragePort();
    await expect(port.retrieve('oid')).rejects.toThrow('not implemented');
  });
});
