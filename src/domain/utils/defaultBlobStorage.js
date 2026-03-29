/**
 * In-memory blob storage adapter for browser and test paths.
 *
 * Implements BlobStoragePort with Map-based storage. Content-addressed:
 * identical content always produces the same OID. No CDC chunking —
 * its purpose is port conformance, not chunking behavior.
 *
 * @module domain/utils/defaultBlobStorage
 */

import BlobStoragePort from '../../ports/BlobStoragePort.js';
import { hexEncode } from './bytes.js';

const _encoder = new TextEncoder();

/**
 * Simple content-addressed hash using Web Crypto SHA-256.
 * Falls back to a synchronous FNV-1a for environments without
 * crypto.subtle (plain HTTP in Docker, etc.).
 *
 * @param {Uint8Array} bytes
 * @returns {Promise<string>} hex digest
 */
async function contentHash(bytes) {
  if (typeof globalThis.crypto !== 'undefined' && globalThis.crypto.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', /** @type {ArrayBuffer} */ (bytes.buffer));
    return hexEncode(new Uint8Array(digest));
  }
  // FNV-1a 64-bit (as two 32-bit halves) — not cryptographic, just deterministic
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  for (let i = 0; i < bytes.length; i++) {
    h1 ^= bytes[i];
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= bytes[i];
    h2 = Math.imul(h2, 0x01000193);
  }
  return (h1 >>> 0).toString(16).padStart(8, '0')
    + (h2 >>> 0).toString(16).padStart(8, '0');
}

/**
 * Collects an async iterable into a single Uint8Array.
 *
 * @param {AsyncIterable<Uint8Array>} source
 * @returns {Promise<Uint8Array>}
 */
async function collectAsyncIterable(source) {
  const chunks = [];
  let totalLength = 0;
  for await (const chunk of source) {
    chunks.push(chunk);
    totalLength += chunk.byteLength;
  }
  if (chunks.length === 1) {
    return chunks[0];
  }
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export default class InMemoryBlobStorageAdapter extends BlobStoragePort {
  constructor() {
    super();
    /** @type {Map<string, Uint8Array>} */
    this._store = new Map();
  }

  /**
   * @override
   * @param {Uint8Array|string} content
   * @param {{ slug?: string, mime?: string|null, size?: number|null }} [_options]
   * @returns {Promise<string>}
   */
  async store(content, _options) {
    const bytes = typeof content === 'string'
      ? _encoder.encode(content)
      : content;
    const oid = await contentHash(bytes);
    this._store.set(oid, bytes);
    return oid;
  }

  /**
   * @override
   * @param {string} oid
   * @returns {Promise<Uint8Array>}
   */
  retrieve(oid) {
    const bytes = this._store.get(oid);
    if (!bytes) {
      return Promise.reject(new Error(`InMemoryBlobStorageAdapter: unknown OID '${oid}'`));
    }
    return Promise.resolve(bytes);
  }

  /**
   * @override
   * @param {AsyncIterable<Uint8Array>} source
   * @param {{ slug?: string, mime?: string|null, size?: number|null }} [_options]
   * @returns {Promise<string>}
   */
  async storeStream(source, _options) {
    const bytes = await collectAsyncIterable(source);
    return await this.store(bytes);
  }

  /**
   * @override
   * @param {string} oid
   * @returns {AsyncIterable<Uint8Array>}
   */
  retrieveStream(oid) {
    const bytes = this._store.get(oid);
    if (!bytes) {
      throw new Error(`InMemoryBlobStorageAdapter: unknown OID '${oid}'`);
    }
    const chunk = bytes;
    return /** @type {AsyncIterable<Uint8Array>} */ ({
      [Symbol.asyncIterator]() {
        let done = false;
        return {
          next() {
            if (done) {
              return Promise.resolve({ value: undefined, done: true });
            }
            done = true;
            return Promise.resolve({ value: chunk, done: false });
          },
        };
      },
    });
  }
}
