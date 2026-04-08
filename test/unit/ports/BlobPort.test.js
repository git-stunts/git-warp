import { describe, it, expect } from 'vitest';
import BlobPort from '../../../src/ports/BlobPort.ts';

describe('BlobPort', () => {
  it('abstract methods are not callable on base prototype', () => {
    expect(BlobPort.prototype.writeBlob).toBeUndefined();
    expect(BlobPort.prototype.readBlob).toBeUndefined();
  });

  it('concrete subclass satisfies the contract', async () => {
    class TestBlob extends BlobPort {
      async writeBlob() { return 'oid'; }
      async readBlob() { return new Uint8Array([1]); }
    }
    const blob = new TestBlob();
    expect(blob).toBeInstanceOf(BlobPort);
    expect(await blob.writeBlob(new Uint8Array())).toBe('oid');
    expect(await blob.readBlob('x')).toEqual(new Uint8Array([1]));
  });
});
