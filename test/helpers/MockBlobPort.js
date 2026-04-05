import { vi } from 'vitest';
import BlobPort from '../../src/ports/BlobPort.js';

/**
 * In-memory BlobPort for tests.
 *
 * Stores blobs in a Map and returns deterministic OIDs.
 * Methods are Vitest spies so callers can assert on calls.
 */
export default class MockBlobPort extends BlobPort {
  constructor() {
    super();
    /** @type {Map<string, Uint8Array>} */
    this.store = new Map();
    /** @type {number} */
    this._counter = 0;

    // Bind spy wrappers so vitest assertions work
    const self = this;

    /** @type {import('vitest').Mock} */
    this.writeBlob = vi.fn(async (/** @type {Uint8Array} */ content) => {
      const oid = `blob_${String(self._counter++).padStart(40, '0')}`;
      self.store.set(oid, content);
      return oid;
    });

    /** @type {import('vitest').Mock} */
    this.readBlob = vi.fn(async (/** @type {string} */ oid) => {
      const data = self.store.get(oid);
      if (!data) { throw new Error(`Blob not found: ${oid}`); }
      return data;
    });
  }
}
