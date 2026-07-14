/**
 * In-memory blob storage adapter for tests.
 *
 * Implements BlobStoragePort with Map-based storage. Content-addressed:
 * identical content always produces the same OID. No CDC chunking —
 * its purpose is port conformance, not chunking behavior.
 *
 * @module test/helpers/InMemoryBlobStorageAdapter
 */

import StorageError from '../../src/domain/errors/StorageError.ts';
import BlobStoragePort from '../../src/ports/BlobStoragePort.ts';
import { hexEncode } from '../../src/domain/utils/bytes.ts';
import { collectAsyncIterable } from '../../src/domain/utils/streamUtils.ts';

const _encoder = new TextEncoder();

/**
 * Simple content-addressed hash using Web Crypto SHA-256.
 */
async function contentHash(bytes: Uint8Array): Promise<string> {
  const buffer = new Uint8Array(bytes).buffer;
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return hexEncode(new Uint8Array(digest));
}

interface StorageOptions {
  slug?: string;
  mime?: string | null;
  size?: number | null;
}

/**
 * In-memory content-addressed blob storage for tests.
 */
export default class InMemoryBlobStorageAdapter extends BlobStoragePort {
  private readonly _store: Map<string, Uint8Array>;

  /** Creates an empty in-memory blob store. */
  constructor() {
    super();
    this._store = new Map();
  }

  /** @override */
  async store(content: Uint8Array | string, _options?: StorageOptions): Promise<string> {
    const bytes = typeof content === 'string'
      ? _encoder.encode(content)
      : content;
    const oid = await contentHash(bytes);
    this._store.set(oid, bytes);
    return oid;
  }

  /** @override */
  retrieve(oid: string): Promise<Uint8Array> {
    const bytes = this._store.get(oid);
    if (!bytes) {
      return Promise.reject(new StorageError(`InMemoryBlobStorageAdapter: unknown OID '${oid}'`, { operation: 'retrieve', oid })); // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
    }
    return Promise.resolve(bytes);
  }

  /** @override */
  async storeStream(source: AsyncIterable<Uint8Array>, _options?: StorageOptions): Promise<string> {
    const bytes = await collectAsyncIterable(source);
    return await this.store(bytes);
  }

  /** @override */
  retrieveStream(oid: string): AsyncIterable<Uint8Array> {
    const bytes = this._store.get(oid);
    if (!bytes) {
      throw new StorageError(`InMemoryBlobStorageAdapter: unknown OID '${oid}'`, { operation: 'retrieveStream', oid }); // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
    }
    const chunk = bytes;
    return {
      [Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
        let done = false;
        return {
          next(): Promise<IteratorResult<Uint8Array>> {
            if (done) {
              return Promise.resolve({ value: undefined, done: true });
            }
            done = true;
            return Promise.resolve({ value: chunk, done: false });
          },
        };
      },
    };
  }
}
