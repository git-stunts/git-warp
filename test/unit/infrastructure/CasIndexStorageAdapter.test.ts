import { describe, expect, it, vi } from 'vitest';
import BlobStoragePort from '../../../src/ports/BlobStoragePort.ts';
import { decodeCasPayloadPointer } from '../../../src/infrastructure/adapters/CasPayloadPointer.ts';
import { CasIndexStorageAdapter } from '../../../src/infrastructure/adapters/CasIndexStorageAdapter.ts';
import MockBlobPort from '../../helpers/MockBlobPort.ts';
import MockTreePort from '../../helpers/MockTreePort.ts';
import RefPort from '../../../src/ports/RefPort.ts';

class MemoryBlobStorage extends BlobStoragePort {
  private readonly _store: Map<string, Uint8Array> = new Map();
  private _counter: number = 0;

  override async store(content: Uint8Array | string): Promise<string> {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    const oid = `storage_${String(this._counter++).padStart(4, '0')}`;
    this._store.set(oid, bytes);
    return oid;
  }

  override async retrieve(oid: string): Promise<Uint8Array> {
    const bytes = this._store.get(oid);
    if (bytes === undefined) {
      throw new Error(`Storage OID not found: ${oid}`);
    }
    return bytes;
  }

  override async storeStream(source: AsyncIterable<Uint8Array>): Promise<string> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of source) {
      chunks.push(chunk);
    }
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    return await this.store(merged);
  }

  override retrieveStream(oid: string): AsyncIterable<Uint8Array> {
    const storage = this;
    return {
      async *[Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
        yield await storage.retrieve(oid);
      },
    };
  }
}

class MockRefPort extends RefPort {
  private readonly _refs: Map<string, string> = new Map();

  override async updateRef(ref: string, oid: string): Promise<void> {
    this._refs.set(ref, oid);
  }

  override async readRef(ref: string): Promise<string | null> {
    return this._refs.get(ref) ?? null;
  }

  override async deleteRef(ref: string): Promise<void> {
    this._refs.delete(ref);
  }

  override async listRefs(prefix: string): Promise<string[]> {
    return Array.from(this._refs.keys()).filter((ref) => ref.startsWith(prefix));
  }

  override async compareAndSwapRef(ref: string, newOid: string, expectedOid: string | null): Promise<void> {
    const current = this._refs.get(ref) ?? null;
    if (current !== expectedOid) {
      throw new Error('CAS mismatch');
    }
    this._refs.set(ref, newOid);
  }
}

describe('CasIndexStorageAdapter', () => {
  it('stores streamed blobs behind CAS pointer blobs and retrieves them as streams', async () => {
    const blobPort = new MockBlobPort();
    const treePort = new MockTreePort();
    const refPort = new MockRefPort();
    const blobStorage = new MemoryBlobStorage();
    const adapter = new CasIndexStorageAdapter({
      blobPort,
      treePort,
      refPort,
      blobStorage,
    });

    const storeStreamSpy = vi.spyOn(blobStorage, 'storeStream');
    const retrieveStreamSpy = vi.spyOn(blobStorage, 'retrieveStream');
    const oid = await adapter.writeBlobStream((async function* () {
      yield new Uint8Array([1, 2]);
      yield new Uint8Array([3, 4]);
    })());

    const pointerBytes = await blobPort.readBlob(oid);
    const storageOid = decodeCasPayloadPointer(pointerBytes);
    expect(storageOid).not.toBeNull();
    expect(storeStreamSpy).toHaveBeenCalled();

    const chunks: Uint8Array[] = [];
    for await (const chunk of adapter.readBlobStream(oid)) {
      chunks.push(chunk);
    }

    expect(retrieveStreamSpy).toHaveBeenCalledWith(storageOid);
    expect(chunks).toEqual([new Uint8Array([1, 2, 3, 4])]);
  });
});
