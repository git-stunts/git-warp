import { vi } from 'vitest';
import TreePort from '../../src/ports/TreePort.js';

/**
 * In-memory TreePort for tests.
 *
 * Stores trees as Map<treeOid, Record<path, blobOid>> and supports
 * writeTree (mktree-formatted entries) and readTreeOids.
 * Methods are Vitest spies so callers can assert on calls.
 */
export default class MockTreePort extends TreePort {
  constructor() {
    super();
    /** @type {Map<string, Record<string, string>>} */
    this.store = new Map();
    /** @type {number} */
    this._counter = 0;

    const self = this;

    /** @type {import('vitest').Mock} */
    this.writeTree = vi.fn(async (/** @type {string[]} */ entries) => {
      const treeOid = `tree_${String(self._counter++).padStart(40, '0')}`;
      /** @type {Record<string, string>} */
      const oidMap = {};
      for (const entry of entries) {
        // Parse mktree format: "100644 blob <oid>\t<path>"
        const tabIdx = entry.indexOf('\t');
        const path = entry.slice(tabIdx + 1);
        const parts = entry.slice(0, tabIdx).split(' ');
        oidMap[path] = /** @type {string} */ (parts[2]);
      }
      self.store.set(treeOid, oidMap);
      return treeOid;
    });

    /** @type {import('vitest').Mock} */
    this.readTreeOids = vi.fn(async (/** @type {string} */ treeOid) => {
      const tree = self.store.get(treeOid);
      if (!tree) { throw new Error(`Tree not found: ${treeOid}`); }
      return { ...tree };
    });

    /** @type {import('vitest').Mock} */
    this.readTree = vi.fn(async (/** @type {string} */ _treeOid) => {
      throw new Error('MockTreePort.readTree() not implemented — use readTreeOids');
    });
  }

  /** @returns {string} */
  get emptyTree() {
    return '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  }
}
