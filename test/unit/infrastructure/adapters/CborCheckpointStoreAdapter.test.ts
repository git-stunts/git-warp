import { describe, expect, it, vi } from 'vitest';
import {
  BundleHandle as GitCasBundleHandle,
  RetentionWitness,
} from '@git-stunts/git-cas';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import type { LWWRegister } from '../../../../src/domain/crdt/LWW.ts';
import ORSet from '../../../../src/domain/crdt/ORSet.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { ProvenanceIndex } from '../../../../src/domain/services/provenance/ProvenanceIndex.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import type { PropValue } from '../../../../src/domain/types/PropValue.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import { collectAsyncIterable } from '../../../../src/domain/utils/streamUtils.ts';
import {
  CborCheckpointStoreAdapter,
  type GitCasCheckpointFacade,
} from '../../../../src/infrastructure/adapters/CborCheckpointStoreAdapter.ts';
import { CborIndexStoreAdapter } from '../../../../src/infrastructure/adapters/CborIndexStoreAdapter.ts';
import GitCasAssetStorageAdapter from '../../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import {
  DEFAULT_COMMIT_MESSAGE_CODEC,
} from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';
import CheckpointStorePort from '../../../../src/ports/CheckpointStorePort.ts';
import {
  CHECKPOINT_STORAGE_FORMAT,
  LEGACY_CHECKPOINT_STORAGE_FORMAT,
} from '../../../../src/ports/CommitMessageCodecPort.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';

function createState(): WarpState {
  const nodeAlive = ORSet.empty();
  nodeAlive.add('user:alice', Dot.create('w1', 1));
  nodeAlive.add('user:bob', Dot.create('w1', 2));
  const edgeAlive = ORSet.empty();
  edgeAlive.add('user:alice\0user:bob\0knows', Dot.create('w1', 3));
  const prop = new Map<string, LWWRegister<PropValue>>();
  prop.set('user:alice\0name', {
    eventId: new EventId(1, 'w1', 'a'.repeat(40), 0),
    value: 'Alice',
  });
  const observedFrontier = VersionVector.empty();
  observedFrontier.set('w1', 3);
  return new WarpState({ nodeAlive, edgeAlive, prop, observedFrontier });
}

function createFixture() {
  const codec = new CborCodec();
  const history = new InMemoryGraphAdapter();
  const backing = new InMemoryBlobStorageAdapter();
  const cas = new InMemoryGitCasFacade({ history, storage: backing });
  const assets = new GitCasAssetStorageAdapter({ cas, legacyReader: history });
  const checkpoints = new CborCheckpointStoreAdapter({
    codec,
    commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
    history,
    assetStorage: assets,
    cas,
  });
  return { codec, history, backing, cas, assets, checkpoints };
}

function record(options: {
  index?: boolean;
  parents?: string[];
  provenance?: boolean;
} = {}) {
  const appliedVV = VersionVector.empty();
  appliedVV.set('w1', 3);
  return {
    graphName: 'test',
    state: createState(),
    frontier: new Map([['w1', 'a'.repeat(40)]]),
    appliedVV,
    stateHash: 'd'.repeat(64),
    parents: options.parents ?? [],
    ...(options.provenance === true ? { provenanceIndex: ProvenanceIndex.empty() } : {}),
    ...(options.index === true
      ? { indexShards: { 'meta_aa.cbor': new CborCodec().encode({ node: 1 }) } }
      : {}),
  };
}

describe('CborCheckpointStoreAdapter semantic lifecycle', () => {
  it('is a CheckpointStorePort and requires every semantic dependency', () => {
    const { codec, history, assets, cas, checkpoints } = createFixture();
    expect(checkpoints).toBeInstanceOf(CheckpointStorePort);

    // @ts-expect-error Runtime dependency guard for JavaScript callers.
    expect(() => new CborCheckpointStoreAdapter({ commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC, history, assetStorage: assets, cas }))
      .toThrow(/codec/);
    // @ts-expect-error Runtime dependency guard for JavaScript callers.
    expect(() => new CborCheckpointStoreAdapter({ codec, history, assetStorage: assets, cas }))
      .toThrow(/commitMessageCodec/);
    // @ts-expect-error Runtime dependency guard for JavaScript callers.
    expect(() => new CborCheckpointStoreAdapter({ codec, commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC, assetStorage: assets, cas }))
      .toThrow(/history/);
    expect(() => new CborCheckpointStoreAdapter({
      codec,
      commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
      history,
      assetStorage: assets,
      // @ts-expect-error Runtime dependency guard for JavaScript callers.
      cas: null,
    })).toThrow(/cas/);
  });

  it('publishes, resolves, and round-trips checkpoint state', async () => {
    const { checkpoints } = createFixture();
    const published = await checkpoints.publishCheckpoint(record());
    const loaded = await checkpoints.loadCheckpoint(published.checkpointSha);

    expect(await checkpoints.resolveHead('test')).toBe(published.checkpointSha);
    expect(loaded.stateHash).toBe('d'.repeat(64));
    expect(loaded.schema).toBe(5);
    expect(loaded.state.nodeAlive.contains('user:alice')).toBe(true);
    expect(loaded.state.edgeAlive.contains('user:alice\0user:bob\0knows')).toBe(true);
    expect(loaded.state.getNodeProp('user:alice', 'name')?.value).toBe('Alice');
    expect(loaded.frontier).toEqual(new Map([['w1', 'a'.repeat(40)]]));
    expect(loaded.appliedVV?.get('w1')).toBe(3);
    expect(loaded.indexShardHandles).toBeNull();
    expect(published.retention.reachability).toBe('anchored');
    expect(published.retention.handle.equals(published.bundleHandle)).toBe(true);
  });

  it('rejects a checkpoint bound to a different graph before opening assets', async () => {
    const { assets, checkpoints } = createFixture();
    const published = await checkpoints.publishCheckpoint(record());
    const open = vi.spyOn(assets, 'open');

    await expect(checkpoints.loadCheckpoint(published.checkpointSha, 'other'))
      .rejects.toMatchObject({
        code: 'E_CHECKPOINT_GRAPH_MISMATCH',
        context: {
          actualGraphName: 'test',
          expectedGraphName: 'other',
        },
      });
    await expect(checkpoints.readMetadata(published.checkpointSha, 'other'))
      .rejects.toMatchObject({ code: 'E_CHECKPOINT_GRAPH_MISMATCH' });
    await expect(checkpoints.loadBasis(published.checkpointSha, 'other'))
      .rejects.toMatchObject({ code: 'E_CHECKPOINT_GRAPH_MISMATCH' });
    expect(open).not.toHaveBeenCalled();
  });

  it('reads metadata without opening checkpoint payloads', async () => {
    const { assets, checkpoints } = createFixture();
    const published = await checkpoints.publishCheckpoint(record());
    const open = vi.spyOn(assets, 'open');

    await expect(checkpoints.readMetadata(published.checkpointSha)).resolves.toEqual({
      checkpointSha: published.checkpointSha,
      stateHash: 'd'.repeat(64),
      schema: 5,
    });
    expect(open).not.toHaveBeenCalled();
  });

  it('loads a bounded basis and opens one shard through an opaque handle', async () => {
    const { codec, assets, checkpoints } = createFixture();
    const published = await checkpoints.publishCheckpoint(record({ index: true }));
    const basis = await checkpoints.loadBasis(published.checkpointSha);
    const shardHandle = basis.indexShardHandles['meta_aa.cbor'];
    if (shardHandle === undefined) {
      throw new Error('expected checkpoint index shard handle');
    }
    const bytes = await collectAsyncIterable(assets.open(shardHandle));

    expect(codec.decode(bytes)).toEqual({ node: 1 });
    expect(basis.frontier).toEqual(new Map([['w1', 'a'.repeat(40)]]));
    expect(Object.isFrozen(basis.indexShardHandles)).toBe(true);
  });

  it('round-trips an optional provenance index through the checkpoint bundle', async () => {
    const { checkpoints } = createFixture();
    const published = await checkpoints.publishCheckpoint(record({ provenance: true }));
    const loaded = await checkpoints.loadCheckpoint(published.checkpointSha);

    expect(loaded.provenanceIndex?.toJSON()).toEqual(ProvenanceIndex.empty().toJSON());
  });

  it('rejects an index member whose bytes are missing at publication time', async () => {
    const { checkpoints } = createFixture();
    const indexShards: Record<string, Uint8Array> = {};
    Object.defineProperty(indexShards, 'missing.cbor', {
      enumerable: true,
      value: undefined,
    });

    await expect(checkpoints.publishCheckpoint({ ...record(), indexShards }))
      .rejects.toMatchObject({ code: 'E_CHECKPOINT_MISSING_INDEX_SHARD' });
  });

  it('fails closed when a checkpoint has no bounded index basis', async () => {
    const { checkpoints } = createFixture();
    const published = await checkpoints.publishCheckpoint(record());

    await expect(checkpoints.loadBasis(published.checkpointSha))
      .rejects.toMatchObject({ code: 'E_CHECKPOINT_MISSING_INDEX' });
  });

  it('rejects a publication result that names a different bundle', async () => {
    const fixture = createFixture();
    const otherBundle = await fixture.cas.bundles.putOrdered({ members: [] });
    const cas: GitCasCheckpointFacade = {
      bundles: fixture.cas.bundles,
      publications: {
        commit: async (request) => {
          const publication = await fixture.cas.publications.commit(request);
          return Object.freeze({ ...publication, root: otherBundle.handle });
        },
      },
    };

    await expect(checkpointAdapter(fixture, cas).publishCheckpoint(record()))
      .rejects.toMatchObject({ code: 'E_CHECKPOINT_PUBLICATION_MISMATCH' });
  });

  it('rejects retention evidence that names a different bundle', async () => {
    const fixture = createFixture();
    const otherBundle = await fixture.cas.bundles.putOrdered({ members: [] });
    const cas: GitCasCheckpointFacade = {
      bundles: fixture.cas.bundles,
      publications: {
        commit: async (request) => {
          const publication = await fixture.cas.publications.commit(request);
          const witness = new RetentionWitness({
            handle: otherBundle.handle,
            policy: 'pinned',
            reachability: 'anchored',
            root: {
              kind: 'publication',
              namespace: publication.ref,
              ref: publication.ref,
              generation: publication.commitId,
              path: '/',
            },
            observedAt: new Date(0).toISOString(),
          });
          return Object.freeze({ ...publication, witness });
        },
      },
    };

    await expect(checkpointAdapter(fixture, cas).publishCheckpoint(record()))
      .rejects.toMatchObject({ code: 'E_CHECKPOINT_RETENTION_MISMATCH' });
  });

  it('rejects non-asset checkpoint bundle members', async () => {
    const fixture = createFixture();
    const published = await fixture.checkpoints.publishCheckpoint(record());
    const cas: GitCasCheckpointFacade = {
      bundles: {
        putOrdered: fixture.cas.bundles.putOrdered,
        iterateMembers: async function* (request) {
          for await (const member of fixture.cas.bundles.iterateMembers(request)) {
            yield Object.freeze({
              ...member,
              handle: GitCasBundleHandle.parse(published.bundleHandle.toString()),
            });
          }
        },
      },
      publications: fixture.cas.publications,
    };

    await expect(checkpointAdapter(fixture, cas).loadCheckpoint(published.checkpointSha))
      .rejects.toMatchObject({ code: 'E_CHECKPOINT_INVALID_BUNDLE_MEMBER' });
  });

  it('rejects duplicate checkpoint bundle member paths', async () => {
    const fixture = createFixture();
    const published = await fixture.checkpoints.publishCheckpoint(record());
    const cas: GitCasCheckpointFacade = {
      bundles: {
        putOrdered: fixture.cas.bundles.putOrdered,
        iterateMembers: async function* (request) {
          let duplicated = false;
          for await (const member of fixture.cas.bundles.iterateMembers(request)) {
            yield member;
            if (!duplicated) {
              yield member;
              duplicated = true;
            }
          }
        },
      },
      publications: fixture.cas.publications,
    };

    await expect(checkpointAdapter(fixture, cas).loadCheckpoint(published.checkpointSha))
      .rejects.toMatchObject({ code: 'E_CHECKPOINT_DUPLICATE_BUNDLE_MEMBER' });
  });

  it('rejects an empty index member path in a checkpoint bundle', async () => {
    const fixture = createFixture();
    const published = await fixture.checkpoints.publishCheckpoint(record());
    const cas: GitCasCheckpointFacade = {
      bundles: {
        putOrdered: fixture.cas.bundles.putOrdered,
        iterateMembers: async function* (request) {
          let replaced = false;
          for await (const member of fixture.cas.bundles.iterateMembers(request)) {
            yield replaced ? member : Object.freeze({ ...member, path: 'index/' });
            replaced = true;
          }
        },
      },
      publications: fixture.cas.publications,
    };

    await expect(checkpointAdapter(fixture, cas).loadCheckpoint(published.checkpointSha))
      .rejects.toMatchObject({ code: 'E_CHECKPOINT_INVALID_BUNDLE_MEMBER' });
  });

  it('rejects current checkpoint metadata without a bundle handle', async () => {
    const { history, checkpoints } = createFixture();
    const checkpointSha = await history.commitNode({
      message: malformedCheckpointMessage(CHECKPOINT_STORAGE_FORMAT),
      parents: [],
    });

    await expect(checkpoints.loadCheckpoint(checkpointSha))
      .rejects.toMatchObject({ code: 'E_CHECKPOINT_MISSING_BUNDLE_HANDLE' });
    await expect(checkpoints.readMetadata(checkpointSha))
      .rejects.toMatchObject({ code: 'E_CHECKPOINT_MISSING_BUNDLE_HANDLE' });
  });

  it('rejects bundle handles attached to legacy checkpoint storage metadata', async () => {
    const { history, checkpoints } = createFixture();
    const published = await checkpoints.publishCheckpoint(record());
    const currentMessage = DEFAULT_COMMIT_MESSAGE_CODEC.encodeCheckpoint({
      kind: 'checkpoint',
      graph: 'test',
      stateHash: 'd'.repeat(64),
      schema: 5,
      checkpointVersion: CHECKPOINT_STORAGE_FORMAT,
      bundleHandle: published.bundleHandle,
    });
    const checkpointSha = await history.commitNode({
      message: currentMessage.replace(
        `eg-checkpoint: ${CHECKPOINT_STORAGE_FORMAT}`,
        `eg-checkpoint: ${LEGACY_CHECKPOINT_STORAGE_FORMAT}`,
      ),
      parents: [],
    });

    await expect(checkpoints.readMetadata(checkpointSha))
      .rejects.toMatchObject({ code: 'E_CHECKPOINT_UNSUPPORTED_STORAGE' });
  });

  it('rejects unknown checkpoint storage versions', async () => {
    const { history, checkpoints } = createFixture();
    const checkpointSha = await history.commitNode({
      message: malformedCheckpointMessage('v999'),
      parents: [],
    });

    await expect(checkpoints.readMetadata(checkpointSha))
      .rejects.toMatchObject({ code: 'E_CHECKPOINT_UNSUPPORTED_STORAGE' });
  });

  it.each([
    null,
    [],
    { w1: 1 },
    { '': 'a'.repeat(40) },
    { w1: '' },
  ])('rejects malformed decoded frontier entries: %j', async (frontier) => {
    const fixture = createFixture();
    const checkpointSha = await checkpointWithFrontier(fixture, frontier);

    await expect(fixture.checkpoints.loadCheckpoint(checkpointSha))
      .rejects.toMatchObject({ code: 'E_CHECKPOINT_INVALID_FRONTIER' });
  });

  it('publishes coverage as a causal anchor of checkpoint parents', async () => {
    const { history, checkpoints } = createFixture();
    const published = await checkpoints.publishCheckpoint(record());
    const coverageSha = await checkpoints.publishCoverage({
      graphName: 'test',
      parents: [published.checkpointSha],
    });

    expect((await history.getNodeInfo(coverageSha)).parents).toEqual([published.checkpointSha]);
    expect(DEFAULT_COMMIT_MESSAGE_CODEC.detectKind(await history.showNode(coverageSha))).toBe('anchor');
  });
});

async function checkpointWithFrontier(
  fixture: ReturnType<typeof createFixture>,
  frontier: unknown,
): Promise<string> {
  const published = await fixture.checkpoints.publishCheckpoint(record());
  const frontierMember = fixture.cas.readBundleMembers(published.bundleHandle.toString())
    .find(([path]) => path === 'frontier.cbor');
  if (frontierMember === undefined) {
    throw new Error('expected frontier bundle member');
  }
  fixture.backing.replace(frontierMember[1], fixture.codec.encode(frontier));
  return published.checkpointSha;
}

function checkpointAdapter(
  fixture: ReturnType<typeof createFixture>,
  cas: GitCasCheckpointFacade,
): CborCheckpointStoreAdapter {
  return new CborCheckpointStoreAdapter({
    codec: fixture.codec,
    commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
    history: fixture.history,
    assetStorage: fixture.assets,
    cas,
  });
}

function malformedCheckpointMessage(storageVersion: string): string {
  const legacy = DEFAULT_COMMIT_MESSAGE_CODEC.encodeCheckpoint({
    kind: 'checkpoint',
    graph: 'test',
    stateHash: 'd'.repeat(64),
    schema: 5,
    checkpointVersion: LEGACY_CHECKPOINT_STORAGE_FORMAT,
    bundleHandle: null,
  });
  return legacy.replace(
    `eg-checkpoint: ${LEGACY_CHECKPOINT_STORAGE_FORMAT}`,
    `eg-checkpoint: ${storageVersion}`,
  );
}
