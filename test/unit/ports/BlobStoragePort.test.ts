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
      async store(_content: Uint8Array | string) { return 'oid'; }
      async retrieve(_oid: string) { return new Uint8Array([1]); }
      async storeStream(_source: AsyncIterable<Uint8Array>) { return 'stream-oid'; }
      async *retrieveStream(_oid: string) { yield new Uint8Array([2]); }
    }
    const s = new TestStorage();
    expect(s).toBeInstanceOf(BlobStoragePort);
    expect(await s.store(new Uint8Array())).toBe('oid');
    expect(await s.retrieve('x')).toEqual(new Uint8Array([1]));
  });
});
