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

  it('storeStream() throws not implemented', async () => {
    const port = new BlobStoragePort();
    async function* source() {
      yield new Uint8Array([1, 2, 3]);
    }
    await expect(port.storeStream(source())).rejects.toThrow('not implemented');
  });

  it('retrieveStream() throws not implemented', () => {
    const port = new BlobStoragePort();
    expect(() => port.retrieveStream('oid')).toThrow('not implemented');
  });
});
