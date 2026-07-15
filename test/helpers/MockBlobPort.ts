import { vi } from 'vitest';

/**
 * In-memory BlobPort for tests.
 *
 * Stores blobs in a Map and returns deterministic OIDs.
 * Methods are Vitest spies so callers can assert on calls.
 */
export default class MockBlobPort {
  /** @type {Map<string, Uint8Array>} */
  store = new Map();

  /** @type {number} */
  _counter = 0;

  /**
   * @param {Uint8Array | string} content
   * @returns {Promise<string>}
   */
  writeBlob = vi.fn(async (content) => {
    const oid = `blob_${String(this._counter++).padStart(40, '0')}`;
    this.store.set(oid, content);
    return oid;
  });

  /**
   * @param {string} oid
   * @returns {Promise<Uint8Array>}
   */
  readBlob = vi.fn(async (oid) => {
    const data = this.store.get(oid);
    if (!data) { throw new Error(`Blob not found: ${oid}`); }
    return data;
  });
}
