import { describe, expect, it } from 'vitest';

import BlobPort from '../../../../src/ports/BlobPort.ts';
import BlobStoragePort, { type BlobStorageOptions } from '../../../../src/ports/BlobStoragePort.ts';
import CommitPort, {
  type CommitLogChunk,
  type CommitNodeOptions,
  type CommitNodeWithTreeOptions,
  type LogNodesOptions,
  type NodeInfo,
  type PingResult,
} from '../../../../src/ports/CommitPort.ts';
import RefPort, { type ListRefsOptions } from '../../../../src/ports/RefPort.ts';
import TreePort from '../../../../src/ports/TreePort.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import { PatchBuilder } from '../../../../src/domain/services/PatchBuilder.ts';
import { encodeEdgeKey } from '../../../../src/domain/services/KeyCodec.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';

describe('PatchBuilder content write intent lowering', () => {
  it('rejects malformed stored node content OIDs before lowering legacy properties', async () => {
    const state = WarpState.empty();
    state.nodeAlive.add('doc:1', Dot.create('writer-a', 1));
    const builder = contentBuilder(state, new IntentBlobStorage(''));

    await expect(builder.attachContent('doc:1', 'hello')).rejects.toThrow(/ContentAttachmentOid/);
    expect(builder.build().ops).toEqual([]);
  });

  it('rejects malformed streamed edge MIME hints before lowering legacy properties', async () => {
    const state = WarpState.empty();
    state.edgeAlive.add(encodeEdgeKey('doc:1', 'doc:2', 'links'), Dot.create('writer-a', 1));
    const blobStorage = new IntentBlobStorage('edge-oid');
    const builder = contentBuilder(state, blobStorage);

    await expect(
      builder.attachEdgeContent('doc:1', 'doc:2', 'links', chunks(), { mime: '' }),
    ).rejects.toThrow(/ContentAttachmentMime/);
    expect(blobStorage.storeStreamCount()).toBe(0);
    expect(builder.build().ops).toEqual([]);
  });
});

function contentBuilder(state: WarpState, blobStorage: BlobStoragePort): PatchBuilder {
  return new PatchBuilder({
    persistence: new IntentPersistence(),
    graphName: 'g',
    writerId: 'writer-a',
    lamport: 1,
    versionVector: VersionVector.empty(),
    getCurrentState: () => state,
    blobStorage,
  });
}

async function* chunks(): AsyncIterable<Uint8Array> {
  yield new TextEncoder().encode('edge');
}

class IntentBlobStorage extends BlobStoragePort {
  private readonly oid: string;
  private storedStreamCount = 0;

  constructor(oid: string) {
    super();
    this.oid = oid;
  }

  async store(
    _content: Uint8Array | string,
    _options?: BlobStorageOptions,
  ): Promise<string> {
    return this.oid;
  }

  async retrieve(_oid: string): Promise<Uint8Array> {
    return new Uint8Array();
  }

  async storeStream(
    _source: AsyncIterable<Uint8Array>,
    _options?: BlobStorageOptions,
  ): Promise<string> {
    this.storedStreamCount += 1;
    return this.oid;
  }

  retrieveStream(_oid: string): AsyncIterable<Uint8Array> {
    return chunks();
  }

  storeStreamCount(): number {
    return this.storedStreamCount;
  }
}

class IntentPersistence extends CommitPort implements BlobPort, TreePort, RefPort {
  readonly emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

  async commitNode(_options: CommitNodeOptions): Promise<string> {
    return 'c'.repeat(40);
  }

  async showNode(_sha: string): Promise<string> {
    return '';
  }

  async getNodeInfo(_sha: string): Promise<NodeInfo> {
    return {
      sha: 'c'.repeat(40),
      message: '',
      author: '',
      date: '',
      parents: [],
    };
  }

  async logNodes(_options: LogNodesOptions): Promise<string> {
    return '';
  }

  async logNodesStream(_options: LogNodesOptions): Promise<WarpStream<CommitLogChunk>> {
    return WarpStream.from<CommitLogChunk>([]);
  }

  async countNodes(_ref: string): Promise<number> {
    return 0;
  }

  async commitNodeWithTree(_options: CommitNodeWithTreeOptions): Promise<string> {
    return 'c'.repeat(40);
  }

  async nodeExists(_sha: string): Promise<boolean> {
    return false;
  }

  async getCommitTree(_sha: string): Promise<string> {
    return this.emptyTree;
  }

  async ping(): Promise<PingResult> {
    return { ok: true, latencyMs: 0 };
  }

  async writeBlob(_content: Uint8Array | string): Promise<string> {
    return 'b'.repeat(40);
  }

  async readBlob(_oid: string): Promise<Uint8Array> {
    return new Uint8Array();
  }

  async writeTree(_entries: string[]): Promise<string> {
    return 't'.repeat(40);
  }

  async readTree(_treeOid: string): Promise<Record<string, Uint8Array>> {
    return {};
  }

  async readTreeOids(_treeOid: string): Promise<Record<string, string>> {
    return {};
  }

  async updateRef(_ref: string, _oid: string): Promise<void> {
  }

  async readRef(_ref: string): Promise<string | null> {
    return null;
  }

  async deleteRef(_ref: string): Promise<void> {
  }

  async listRefs(_prefix: string, _options?: ListRefsOptions): Promise<string[]> {
    return [];
  }

  async compareAndSwapRef(
    _ref: string,
    _newOid: string,
    _expectedOid: string | null,
  ): Promise<void> {
  }
}
