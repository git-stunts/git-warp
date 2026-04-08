/**
 * In-memory blob storage adapter for browser and test paths.
 *
 * Implements BlobStoragePort with Map-based storage. Content-addressed:
 * identical content always produces the same OID. No CDC chunking —
 * its purpose is port conformance, not chunking behavior.
 *
 * @module domain/utils/defaultBlobStorage
 */

import BlobStoragePort from '../../ports/BlobStoragePort.ts';
import { hexEncode } from './bytes.ts';
import { collectAsyncIterable } from './streamUtils.ts';

const _encoder = new TextEncoder();

/**
 * Simple content-addressed hash using Web Crypto SHA-256.
 * Falls back to a synchronous FNV-1a for environments without
 * crypto.subtle (plain HTTP in Docker, etc.).
 */
async function contentHash(bytes: Uint8Array): Promise<string> {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle !== undefined && globalThis.crypto.subtle !== null) {
    const buf = (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', buf);
    return hexEncode(new Uint8Array(digest));
  }
  // FNV-1a 64-bit (as two 32-bit halves) — not cryptographic, just deterministic.
  // Produces 16-char hex OIDs (shorter than SHA). Acceptable because
  // InMemoryBlobStorageAdapter OIDs never leave the process boundary.
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    h1 ^= b;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= b;
    h2 = Math.imul(h2, 0x01000193);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0')
    + (h2 >>> 0).toString(16).padStart(8, '0');
}

interface StorageOptions {
  slug?: string;
  mime?: string | null;
  size?: number | null;
}

/**
 * In-memory content-addressed blob storage for browser and test environments.
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
      return Promise.reject(new Error(`InMemoryBlobStorageAdapter: unknown OID '${oid}'`));
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
      throw new Error(`InMemoryBlobStorageAdapter: unknown OID '${oid}'`);
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
