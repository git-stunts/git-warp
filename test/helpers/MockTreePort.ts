import { vi } from 'vitest';
import TreeEntryFound from '../../src/domain/tree/TreeEntryFound.ts';
import type TreeEntryLimit from '../../src/domain/tree/TreeEntryLimit.ts';
import TreeEntryMissing from '../../src/domain/tree/TreeEntryMissing.ts';
import TreeEntryPath from '../../src/domain/tree/TreeEntryPath.ts';
import TreeEntryPrefixBatch from '../../src/domain/tree/TreeEntryPrefixBatch.ts';
import TreePort from '../../src/ports/TreePort.ts';

/**
 * In-memory TreePort for tests.
 *
 * Stores trees as Map<treeOid, Record<path, blobOid>> and supports
 * writeTree (mktree-formatted entries) and readTreeOids.
 * Methods are Vitest spies so callers can assert on calls.
 */
export default class MockTreePort extends TreePort {
  store: Map<string, Record<string, string>> = new Map();

  _counter: number = 0;

  /**
   * @param {string[]} entries
   * @returns {Promise<string>}
   */
  writeTree = vi.fn(async (entries: string[]): Promise<string> => {
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
  readTreeOids = vi.fn(async (treeOid: string): Promise<Record<string, string>> => {
    const tree = this.store.get(treeOid);
    if (!tree) { throw new Error(`Tree not found: ${treeOid}`); }
    return { ...tree };
  });

  readTreeEntryOid = vi.fn(async (treeOid: string, path: TreeEntryPath) => {
    const tree = this.store.get(treeOid);
    if (!tree) { throw new Error(`Tree not found: ${treeOid}`); }
    const oid = tree[path.value];
    if (oid === undefined) {
      return new TreeEntryMissing(path);
    }
    return new TreeEntryFound({ path, oid });
  });

  readTreeEntryPrefix = vi.fn(async (
    treeOid: string,
    prefix: TreeEntryPath,
    limit: TreeEntryLimit,
  ) => {
    const tree = this.store.get(treeOid);
    if (!tree) { throw new Error(`Tree not found: ${treeOid}`); }
    const entries: TreeEntryFound[] = [];
    const normalizedPrefix = prefix.withoutTrailingSlash();
    const childPrefix = `${normalizedPrefix.value}/`;
    for (const [path, oid] of Object.entries(tree)) {
      if (path === normalizedPrefix.value || path.startsWith(childPrefix)) {
        entries.push(new TreeEntryFound({
          path: new TreeEntryPath(path),
          oid,
        }));
      }
      if (entries.length >= limit.value) {
        break;
      }
    }
    return new TreeEntryPrefixBatch({ prefix, limit, entries });
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
