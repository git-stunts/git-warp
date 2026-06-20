import { vi } from 'vitest';
import StreamingIndexStoragePort from '../../src/ports/StreamingIndexStoragePort.ts';
import { collectAsyncIterable, normalizeToAsyncIterable } from '../../src/domain/utils/streamUtils.ts';

function cloneBytes(bytes: Uint8Array): Uint8Array {
  return new Uint8Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

function singleChunkStream(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  return normalizeToAsyncIterable(bytes);
}

const EMPTY_TREE_OID = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export default class MockStreamingIndexStorage extends StreamingIndexStoragePort {
  private readonly _blobStore: Map<string, Uint8Array> = new Map();
  private readonly _treeStore: Map<string, Record<string, string>> = new Map();
  private readonly _refs: Map<string, string> = new Map();
  private _blobCounter: number = 0;
  private _treeCounter: number = 0;

  constructor() {
    super();
    this._treeStore.set(EMPTY_TREE_OID, {});
  }

  get emptyTree(): string {
    return EMPTY_TREE_OID;
  }

  writeBlob = vi.fn(async (content: Uint8Array | string) => {
    const oid = String(this._blobCounter++).padStart(40, '0');
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    this._blobStore.set(oid, cloneBytes(bytes));
    return oid;
  });

  readBlob = vi.fn(async (oid: string) => {
    const bytes = this._blobStore.get(oid);
    if (bytes === undefined) {
      throw new Error(`Blob not found: ${oid}`);
    }
    return cloneBytes(bytes);
  });

  writeBlobStream = vi.fn(async (source: AsyncIterable<Uint8Array>) => {
    const bytes = await collectAsyncIterable(source);
    return await this.writeBlob(bytes);
  });

  readBlobStream = vi.fn((oid: string) => {
    const bytes = this._blobStore.get(oid);
    if (bytes === undefined) {
      throw new Error(`Blob not found: ${oid}`);
    }
    return singleChunkStream(cloneBytes(bytes));
  });

  writeTree = vi.fn(async (entries: string[]) => {
    const oid = `tree_${String(this._treeCounter++).padStart(40, '0')}`;
    const oidMap: Record<string, string> = {};
    for (const entry of entries) {
      const tabIndex = entry.indexOf('\t');
      const path = entry.slice(tabIndex + 1);
      const parts = entry.slice(0, tabIndex).split(' ');
      const blobOid = parts[2];
      if (blobOid === undefined) {
        throw new Error(`Invalid tree entry: ${entry}`);
      }
      oidMap[path] = blobOid;
    }
    this._treeStore.set(oid, oidMap);
    return oid;
  });

  readTreeOids = vi.fn(async (treeOid: string) => {
    const tree = this._treeStore.get(treeOid);
    if (tree === undefined) {
      throw new Error(`Tree not found: ${treeOid}`);
    }
    return { ...tree };
  });

  readTree = vi.fn(async (treeOid: string) => {
    const tree = await this.readTreeOids(treeOid);
    const files: Record<string, Uint8Array> = {};
    for (const [path, oid] of Object.entries(tree)) {
      files[path] = await this.readBlob(oid);
    }
    return files;
  });

  updateRef = vi.fn(async (ref: string, oid: string) => {
    this._refs.set(ref, oid);
  });

  readRef = vi.fn(async (ref: string) => this._refs.get(ref) ?? null);
}
