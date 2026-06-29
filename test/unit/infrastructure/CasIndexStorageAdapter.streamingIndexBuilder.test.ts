import { describe, expect, it } from 'vitest';
import IndexRebuildService from '../../../src/domain/services/index/IndexRebuildService.ts';
import BlobStoragePort, { type BlobStorageOptions } from '../../../src/ports/BlobStoragePort.ts';
import RefPort from '../../../src/ports/RefPort.ts';
import { CasIndexStorageAdapter } from '../../../src/infrastructure/adapters/CasIndexStorageAdapter.ts';
import { decodeCasPayloadPointer } from '../../../src/infrastructure/adapters/CasPayloadPointer.ts';
import defaultCodec from '../../../src/infrastructure/codecs/CborCodec.ts';
import MockBlobPort from '../../helpers/MockBlobPort.ts';
import MockTreePort from '../../helpers/MockTreePort.ts';

const EMPTY_TREE_OID = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

type IteratedNode = {
  readonly sha: string;
  readonly parents: string[];
};

class RecordingBlobStorage extends BlobStoragePort {
  private readonly _store: Map<string, Uint8Array> = new Map();
  private _counter: number = 0;
  readonly streamWriteOptions: BlobStorageOptions[] = [];

  override async store(content: Uint8Array | string): Promise<string> {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    const oid = `cas_${String(this._counter).padStart(4, '0')}`;
    this._counter += 1;
    this._store.set(oid, new Uint8Array(bytes));
    return oid;
  }

  override async retrieve(oid: string): Promise<Uint8Array> {
    const bytes = this._store.get(oid);
    if (bytes === undefined) {
      throw new Error(`missing CAS payload ${oid}`);
    }
    return new Uint8Array(bytes);
  }

  override async storeStream(
    source: AsyncIterable<Uint8Array>,
    options?: BlobStorageOptions,
  ): Promise<string> {
    if (options !== undefined) {
      this.streamWriteOptions.push(options);
    }
    const chunks: Uint8Array[] = [];
    for await (const chunk of source) {
      chunks.push(chunk);
    }
    const byteLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return await this.store(bytes);
  }

  override retrieveStream(oid: string): AsyncIterable<Uint8Array> {
    const storage = this;
    return {
      async *[Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
        yield await storage.retrieve(oid);
      },
    };
  }
}

class MemoryRefPort extends RefPort {
  private readonly _refs: Map<string, string> = new Map();

  override async updateRef(ref: string, oid: string): Promise<void> {
    this._refs.set(ref, oid);
  }

  override async readRef(ref: string): Promise<string | null> {
    return this._refs.get(ref) ?? null;
  }

  override async deleteRef(ref: string): Promise<void> {
    this._refs.delete(ref);
  }

  override async listRefs(prefix: string): Promise<string[]> {
    return Array.from(this._refs.keys()).filter((ref) => ref.startsWith(prefix));
  }

  override async compareAndSwapRef(
    ref: string,
    newOid: string,
    expectedOid: string | null,
  ): Promise<void> {
    const current = this._refs.get(ref) ?? null;
    if (current !== expectedOid) {
      throw new Error(`ref ${ref} compare-and-swap mismatch`);
    }
    this._refs.set(ref, newOid);
  }
}

class ReadableCasIndexStorageAdapter extends CasIndexStorageAdapter {
  get emptyTree(): string {
    return EMPTY_TREE_OID;
  }

  async readTree(treeOid: string): Promise<Record<string, Uint8Array>> {
    const blobOids = await this.readTreeOids(treeOid);
    const blobs = new Map<string, Uint8Array>();
    for (const [path, oid] of Object.entries(blobOids)) {
      blobs.set(path, await this.readBlob(oid));
    }
    return Object.fromEntries(blobs);
  }
}

class StaticGraphService {
  constructor(private readonly nodes: readonly IteratedNode[]) {}

  async *iterateNodes(): AsyncIterable<IteratedNode> {
    for (const node of this.nodes) {
      yield node;
    }
  }
}

describe('CasIndexStorageAdapter with streaming index rebuilds', () => {
  it('persists streaming index shards as CAS payload pointers', async () => {
    const blobPort = new MockBlobPort();
    const treePort = new MockTreePort();
    const blobStorage = new RecordingBlobStorage();
    const storage = new ReadableCasIndexStorageAdapter({
      blobPort,
      treePort,
      refPort: new MemoryRefPort(),
      blobStorage,
    });
    const service = new IndexRebuildService({
      graphService: new StaticGraphService([
        { sha: 'aa0001', parents: [] },
        { sha: 'bb0001', parents: ['aa0001'] },
        { sha: 'bb0002', parents: ['aa0001'] },
      ]),
      storage,
      codec: defaultCodec,
    });

    const treeOid = await service.rebuild('main', { maxMemoryBytes: 1 });
    const tree = await storage.readTreeOids(treeOid);
    const paths = Object.keys(tree);

    expect(paths.some((path) => path.includes('shards_fwd_aa.chunk-'))).toBe(true);
    expect(paths.some((path) => path.includes('shards_rev_bb.chunk-'))).toBe(true);
    expect(blobStorage.streamWriteOptions.length).toBeGreaterThan(0);

    for (const oid of Object.values(tree)) {
      const pointerBytes = await blobPort.readBlob(oid);
      expect(decodeCasPayloadPointer(pointerBytes)).not.toBeNull();
    }
  });
});
