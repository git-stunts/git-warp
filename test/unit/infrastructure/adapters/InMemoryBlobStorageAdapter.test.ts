import { describe, it, expect } from 'vitest';

import InMemoryBlobStorageAdapter from '../../../../src/infrastructure/adapters/InMemoryBlobStorageAdapter.ts';
import BlobStoragePort from '../../../../src/ports/BlobStoragePort.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collects an async iterable into a single Uint8Array. */
async function collect(/** @type {AsyncIterable<Uint8Array>} */ stream) {
  const chunks: any[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const totalLength = chunks.reduce((sum, c) => sum + c.byteLength, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InMemoryBlobStorageAdapter', () => {
  it('extends BlobStoragePort', () => {
    const adapter = new InMemoryBlobStorageAdapter();
    expect(adapter).toBeInstanceOf(BlobStoragePort);
  });

  describe('store() + retrieve() round-trip', () => {
    it('stores and retrieves Uint8Array content', async () => {
      const adapter = new InMemoryBlobStorageAdapter();
      const content = new Uint8Array([10, 20, 30, 40]);
      const oid = await adapter.store(content);

      expect(typeof oid).toBe('string');
      expect(oid.length).toBeGreaterThan(0);

      const result = await adapter.retrieve(oid);
      expect(result).toEqual(content);
    });

    it('stores and retrieves string content', async () => {
      const adapter = new InMemoryBlobStorageAdapter();
      const oid = await adapter.store('hello world');

      const result = await adapter.retrieve(oid);
      expect(new TextDecoder().decode(result)).toBe('hello world');
    });

    it('returns distinct OIDs for distinct content', async () => {
      const adapter = new InMemoryBlobStorageAdapter();
      const oid1 = await adapter.store('aaa');
      const oid2 = await adapter.store('bbb');
      expect(oid1).not.toBe(oid2);
    });

    it('returns the same OID for identical content (content-addressed)', async () => {
      const adapter = new InMemoryBlobStorageAdapter();
      const oid1 = await adapter.store('same');
      const oid2 = await adapter.store('same');
      expect(oid1).toBe(oid2);
    });
  });

  describe('storeStream() + retrieveStream() round-trip', () => {
    it('stores from an async iterable and retrieves as an async iterable', async () => {
      const adapter = new InMemoryBlobStorageAdapter();
      const data = new TextEncoder().encode('streamed content');

      async function* source() {
        // Yield in two chunks
        yield data.slice(0, 8);
        yield data.slice(8);
      }

      const oid = await adapter.storeStream(source());

      expect(typeof oid).toBe('string');
      expect(oid.length).toBeGreaterThan(0);

      const stream = adapter.retrieveStream(oid);
      const result = await collect(stream);
      expect(new TextDecoder().decode(result)).toBe('streamed content');
    });

    it('stores single-chunk streams', async () => {
      const adapter = new InMemoryBlobStorageAdapter();
      const data = new Uint8Array([1, 2, 3]);

      async function* source() {
        yield data;
      }

      const oid = await adapter.storeStream(source());
      const result = await collect(adapter.retrieveStream(oid));
      expect(result).toEqual(data);
    });
  });

  describe('cross-method compatibility', () => {
    it('content stored via store() is retrievable via retrieveStream()', async () => {
      const adapter = new InMemoryBlobStorageAdapter();
      const oid = await adapter.store('buffered write');

      const result = await collect(adapter.retrieveStream(oid));
      expect(new TextDecoder().decode(result)).toBe('buffered write');
    });

    it('content stored via storeStream() is retrievable via retrieve()', async () => {
      const adapter = new InMemoryBlobStorageAdapter();

      async function* source() {
        yield new TextEncoder().encode('stream write');
      }

      const oid = await adapter.storeStream(source());
      const result = await adapter.retrieve(oid);
      expect(new TextDecoder().decode(result)).toBe('stream write');
    });

    it('uses the fallback hash path when web crypto is unavailable', async () => {
      const adapter = new InMemoryBlobStorageAdapter();
      const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

      Object.defineProperty(globalThis, 'crypto', {
        value: undefined,
        configurable: true,
      });

      try {
        const oid = await adapter.store('fallback-hash');
        expect(oid).toMatch(/^[0-9a-f]{16}$/);
      } finally {
        if (originalDescriptor) {
          Object.defineProperty(globalThis, 'crypto', originalDescriptor);
        } else {
          Reflect.deleteProperty(globalThis, 'crypto');
        }
      }
    });
  });

  describe('error cases', () => {
    it('retrieve() throws for unknown OID', async () => {
      const adapter = new InMemoryBlobStorageAdapter();
      await expect(adapter.retrieve('nonexistent')).rejects.toThrow();
    });

    it('retrieveStream() throws for unknown OID', () => {
      const adapter = new InMemoryBlobStorageAdapter();
      // retrieveStream may throw synchronously or yield an error on first iteration
      expect(() => {
        const stream = adapter.retrieveStream('nonexistent');
        // Force iteration if it returns a lazy iterable
        const iter = stream[Symbol.asyncIterator]();
        return iter.next();
      }).toThrow();
    });
  });
});
