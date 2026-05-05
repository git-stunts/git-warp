import { vi } from 'vitest';
import TreePort from '../../src/ports/TreePort.ts';

/**
 * In-memory TreePort for tests.
 *
 * Stores trees as Map<treeOid, Record<path, blobOid>> and supports
 * writeTree (mktree-formatted entries) and readTreeOids.
 * Methods are Vitest spies so callers can assert on calls.
 */
export default class MockTreePort extends TreePort {
  /** @type {Map<string, Record<string, string>>} */
  store = new Map();

  /** @type {number} */
  _counter = 0;

  /**
   * @param {string[]} entries
   * @returns {Promise<string>}
   */
  writeTree = vi.fn(async (entries) => {
    const treeOid = `tree_${String(this._counter++).padStart(40, '0')}`;
    /** @type {Record<string, string>} */
    const oidMap = {};
    for (const entry of entries) {
      // Parse mktree format: "100644 blob <oid>\t<path>"
      const tabIdx = entry.indexOf('\t');
      const path = entry.slice(tabIdx + 1);
      const parts = entry.slice(0, tabIdx).split(' ');
      oidMap[path] = /** @type {string} */ (parts[2]);
    }
    this.store.set(treeOid, oidMap);
    return treeOid;
  });

  /**
   * @param {string} treeOid
   * @returns {Promise<Record<string, string>>}
   */
  readTreeOids = vi.fn(async (treeOid) => {
    const tree = this.store.get(treeOid);
    if (!tree) { throw new Error(`Tree not found: ${treeOid}`); }
    return { ...tree };
  });

  /**
   * @param {string} _treeOid
   * @returns {Promise<Record<string, Uint8Array>>}
   */
  readTree = vi.fn(async (_treeOid) => {
    throw new Error('MockTreePort.readTree() not implemented — use readTreeOids');
  });

  /** @returns {string} */
  get emptyTree() {
    return '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  }
}
