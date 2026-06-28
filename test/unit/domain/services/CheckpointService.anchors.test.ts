import { describe, expect, it } from 'vitest';
import { createCheckpointEnvelope, type CheckpointPersistence } from '../../../../src/domain/services/state/checkpointCreate.ts';
import { createFrontier, updateFrontier } from '../../../../src/domain/services/Frontier.ts';
import { createEmptyState, encodePropKey as encodePropKeyV5 } from '../../../../src/domain/services/JoinReducer.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { CONTENT_PROPERTY_KEY } from '../../../../src/domain/services/KeyCodec.ts';
import type { ContentAnchorObjectType } from '../../../../src/domain/services/state/checkpointHelpers.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import type WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import type {
  CommitLogChunk,
  CommitNodeOptions,
  CommitNodeWithTreeOptions,
  LogNodesOptions,
  NodeInfo,
  PingResult,
} from '../../../../src/ports/CommitPort.ts';

const crypto = new NodeCryptoAdapter();

function makeOid(prefix: string): string {
  const base = prefix.replace(/[^0-9a-f]/gi, '0').toLowerCase();
  return (base + '0'.repeat(40)).slice(0, 40);
}

function makeSequentialOid(index: number): string {
  return index.toString(16).padStart(40, '0');
}

class AnchorCheckpointPersistenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnchorCheckpointPersistenceError';
  }
}

class AnchorCheckpointPersistence implements CheckpointPersistence {
  readonly writtenTrees: string[][] = [];
  private readonly _objectTypes = new Map<string, ContentAnchorObjectType>();
  private _blobIndex = 0;

  get emptyTree(): string {
    return makeOid('empty');
  }

  setObjectType(oid: string, objectType: ContentAnchorObjectType): void {
    this._objectTypes.set(oid, objectType);
  }

  envelopeTreeEntries(): readonly string[] {
    const entries = this.writtenTrees[1];
    if (entries === undefined) {
      throw new AnchorCheckpointPersistenceError('Missing checkpoint envelope tree write');
    }
    return entries;
  }

  async writeBlob(_content: Uint8Array | string): Promise<string> {
    this._blobIndex += 1;
    return makeOid(`blob${this._blobIndex}`);
  }

  async readBlob(_oid: string): Promise<Uint8Array> {
    throw new AnchorCheckpointPersistenceError('readBlob is not used by anchor creation tests');
  }

  async writeTree(entries: string[]): Promise<string> {
    this.writtenTrees.push([...entries]);
    return makeOid(`tree${this.writtenTrees.length}`);
  }

  async readTree(_treeOid: string): Promise<Record<string, Uint8Array>> {
    throw new AnchorCheckpointPersistenceError('readTree is not used by anchor creation tests');
  }

  async readTreeOids(_treeOid: string): Promise<Record<string, string>> {
    throw new AnchorCheckpointPersistenceError('readTreeOids is not used by anchor creation tests');
  }

  async commitNode(_options: CommitNodeOptions): Promise<string> {
    throw new AnchorCheckpointPersistenceError('commitNode is not used by anchor creation tests');
  }

  async commitNodeWithTree(_options: CommitNodeWithTreeOptions): Promise<string> {
    return makeOid('checkpoint');
  }

  async showNode(_sha: string): Promise<string> {
    throw new AnchorCheckpointPersistenceError('showNode is not used by anchor creation tests');
  }

  async getNodeInfo(_sha: string): Promise<NodeInfo> {
    throw new AnchorCheckpointPersistenceError('getNodeInfo is not used by anchor creation tests');
  }

  async logNodes(_options: LogNodesOptions): Promise<string> {
    throw new AnchorCheckpointPersistenceError('logNodes is not used by anchor creation tests');
  }

  async logNodesStream(_options: LogNodesOptions): Promise<WarpStream<CommitLogChunk>> {
    throw new AnchorCheckpointPersistenceError('logNodesStream is not used by anchor creation tests');
  }

  async countNodes(_ref: string): Promise<number> {
    throw new AnchorCheckpointPersistenceError('countNodes is not used by anchor creation tests');
  }

  async nodeExists(_sha: string): Promise<boolean> {
    throw new AnchorCheckpointPersistenceError('nodeExists is not used by anchor creation tests');
  }

  async getCommitTree(_sha: string): Promise<string> {
    throw new AnchorCheckpointPersistenceError('getCommitTree is not used by anchor creation tests');
  }

  async ping(): Promise<PingResult> {
    throw new AnchorCheckpointPersistenceError('ping is not used by anchor creation tests');
  }

  async readObjectType(oid: string): Promise<ContentAnchorObjectType> {
    return this._objectTypes.get(oid) ?? 'tree';
  }
}

describe('CheckpointService content anchors', () => {
  it('preserves legacy raw blob content anchors when creating a checkpoint', async () => {
    const persistence = new AnchorCheckpointPersistence();
    const state = createEmptyState();
    state.nodeAlive.add('legacy', Dot.create('alice', 1));
    state.nodeAlive.add('cas', Dot.create('alice', 2));

    const legacyBlobOid = makeSequentialOid(1);
    const casTreeOid = makeSequentialOid(2);
    persistence.setObjectType(legacyBlobOid, 'blob');
    persistence.setObjectType(casTreeOid, 'tree');

    state.mutatePropRegisterLWW(encodePropKeyV5('legacy', CONTENT_PROPERTY_KEY), {
      eventId: { lamport: 1, writerId: 'alice', patchSha: makeOid('patch1'), opIndex: 0 },
      value: legacyBlobOid,
    });
    state.mutatePropRegisterLWW(encodePropKeyV5('cas', CONTENT_PROPERTY_KEY), {
      eventId: { lamport: 2, writerId: 'alice', patchSha: makeOid('patch2'), opIndex: 0 },
      value: casTreeOid,
    });

    const frontier = createFrontier();
    updateFrontier(frontier, 'alice', makeOid('sha1'));

    await createCheckpointEnvelope({
      persistence,
      graphName: 'test',
      state,
      frontier,
      crypto,
      commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
    });

    expect(persistence.envelopeTreeEntries()).toEqual([
      `100644 blob ${legacyBlobOid}\t_content_${legacyBlobOid}`,
      `040000 tree ${casTreeOid}\t_content_${casTreeOid}`,
      expect.stringContaining('\tappliedVV.cbor'),
      expect.stringContaining('\tfrontier.cbor'),
      expect.stringContaining('\tstate'),
    ]);
  });
});
