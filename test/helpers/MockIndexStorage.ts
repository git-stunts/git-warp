import { vi } from 'vitest';
import IndexStoragePort from '../../src/ports/IndexStoragePort.ts';

function cloneBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes);
}

const EMPTY_TREE_OID = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** Test-only in-memory implementation of the live bitmap index storage port. */
export default class MockIndexStorage extends IndexStoragePort {
  private readonly blobStore = new Map<string, Uint8Array>();
  private readonly treeStore = new Map<string, Record<string, string>>([[EMPTY_TREE_OID, {}]]);
  private readonly refs = new Map<string, string>();
  private blobCounter = 0;
  private treeCounter = 0;

  readonly writeBlob = vi.fn(async (content: Uint8Array | string) => {
    const oid = String(this.blobCounter++).padStart(40, '0');
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    this.blobStore.set(oid, cloneBytes(bytes));
    return oid;
  });

  readonly readBlob = vi.fn(async (oid: string) => {
    const bytes = this.blobStore.get(oid);
    if (bytes === undefined) {
      throw new Error(`Blob not found: ${oid}`);
    }
    return cloneBytes(bytes);
  });

  readonly writeTree = vi.fn(async (entries: string[]) => {
    const oid = `tree_${String(this.treeCounter++).padStart(40, '0')}`;
    const oidMap: Record<string, string> = {};
    for (const entry of entries) {
      const tabIndex = entry.indexOf('\t');
      const path = entry.slice(tabIndex + 1);
      const blobOid = entry.slice(0, tabIndex).split(' ')[2];
      if (blobOid === undefined) {
        throw new Error(`Invalid tree entry: ${entry}`);
      }
      oidMap[path] = blobOid;
    }
    this.treeStore.set(oid, oidMap);
    return oid;
  });

  readonly readTreeOids = vi.fn(async (treeOid: string) => {
    const tree = this.treeStore.get(treeOid);
    if (tree === undefined) {
      throw new Error(`Tree not found: ${treeOid}`);
    }
    return { ...tree };
  });

  readonly updateRef = vi.fn(async (ref: string, oid: string) => {
    this.refs.set(ref, oid);
  });

  readonly readRef = vi.fn(async (ref: string) => this.refs.get(ref) ?? null);
}
