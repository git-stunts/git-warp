import { describe, it, expect } from 'vitest';
import BlobStoragePort from '../../../src/ports/BlobStoragePort.ts';

describe('BlobStoragePort', () => {
  it('abstract methods are not callable on base prototype', () => {
    expect(BlobStoragePort.prototype.store).toBeUndefined();
    expect(BlobStoragePort.prototype.retrieve).toBeUndefined();
    expect(BlobStoragePort.prototype.storeStream).toBeUndefined();
    expect(BlobStoragePort.prototype.retrieveStream).toBeUndefined();
  });

  it('concrete subclass satisfies the contract', async () => {
    class TestStorage extends BlobStoragePort {
      async store() { return 'oid'; }
      async retrieve() { return new Uint8Array([1]); }
      async storeStream() { return 'stream-oid'; }
      async *retrieveStream() { yield new Uint8Array([2]); }
    }
    const s = new TestStorage();
    expect(s).toBeInstanceOf(BlobStoragePort);
    expect(await (/** @type {any} */ (s)).store(new Uint8Array())).toBe('oid');
    expect(await (/** @type {any} */ (s)).retrieve('x')).toEqual(new Uint8Array([1]));
  });
});
