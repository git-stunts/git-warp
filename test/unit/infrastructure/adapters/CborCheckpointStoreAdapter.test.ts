import { describe, expect, it, vi } from 'vitest';
import { RetentionWitness } from '@git-stunts/git-cas';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import type { LWWRegister } from '../../../../src/domain/crdt/LWW.ts';
import ORSet from '../../../../src/domain/crdt/ORSet.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import MaterializationCoordinate from '../../../../src/domain/materialization/MaterializationCoordinate.ts';
import MaterializationHandle from '../../../../src/domain/materialization/MaterializationHandle.ts';
import MaterializationRoot from '../../../../src/domain/materialization/MaterializationRoot.ts';
import MaterializationRoots from '../../../../src/domain/materialization/MaterializationRoots.ts';
import BundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import { MetaShard } from '../../../../src/domain/artifacts/MetaShard.ts';
import { PropertyShard } from '../../../../src/domain/artifacts/PropertyShard.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import { ProvenanceIndex } from '../../../../src/domain/services/provenance/ProvenanceIndex.ts';
import { computeStateHash } from '../../../../src/domain/services/state/StateSerializer.ts';
import type { PropValue } from '../../../../src/domain/types/PropValue.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import {
  CborCheckpointStoreAdapter,
  type GitCasCheckpointFacade,
} from '../../../../src/infrastructure/adapters/CborCheckpointStoreAdapter.ts';
import { CborIndexStoreAdapter } from '../../../../src/infrastructure/adapters/CborIndexStoreAdapter.ts';
import GitCasAssetStorageAdapter from '../../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import GitCasMaterializationStoreAdapter from '../../../../src/infrastructure/adapters/GitCasMaterializationStoreAdapter.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import {
  DEFAULT_COMMIT_MESSAGE_CODEC,
} from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';
import CheckpointStorePort, {
  type CheckpointRecord,
} from '../../../../src/ports/CheckpointStorePort.ts';
import {
  CHECKPOINT_STORAGE_FORMAT,
  LEGACY_CHECKPOINT_STORAGE_FORMAT,
} from '../../../../src/ports/CommitMessageCodecPort.ts';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
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
  const crypto = new NodeCryptoAdapter();
  const history = new InMemoryGraphAdapter();
  const backing = new InMemoryBlobStorageAdapter();
  const cas = new InMemoryGitCasFacade({ history, storage: backing });
  const assets = new GitCasAssetStorageAdapter({ cas, legacyReader: history });
  const indexes = new CborIndexStoreAdapter({ codec, assetStorage: assets, cas });
  const materializations = new GitCasMaterializationStoreAdapter({
    cas,
    codec,
    crypto,
    laneName: 'test',
  });
  const checkpoints = new CborCheckpointStoreAdapter({
    codec,
    crypto,
    commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
    history,
    assetStorage: assets,
    cas,
  });
  return {
    codec,
    crypto,
    history,
    backing,
    cas,
    assets,
    indexes,
    materializations,
    checkpoints,
  };
}

async function record(
  fixture: ReturnType<typeof createFixture>,
  options: { indexes?: boolean; parents?: string[] } = {},
): Promise<CheckpointRecord> {
  const state = createState();
  const frontier = new Map([['w1', 'a'.repeat(40)]]);
  const coordinate = new MaterializationCoordinate({ frontier, ceiling: null });
  const adjacency = await fixture.cas.bundles.putOrdered({ members: [] });
  const unavailable = () => MaterializationRoot.unavailable();
  const indexRoot = options.indexes === true
    ? await fixture.indexes.writeShards(WarpStream.from([
      new MetaShard({
        shardKey: 'aa',
        nodeToGlobal: [['user:alice', 0]],
        nextLocalId: 1,
        alive: new Uint8Array([1]),
      }),
    ]), { memberStorage: 'page', expectedShardCount: 1, maxShardBytes: 1024 })
    : null;
  const propertyRoot = options.indexes === true
    ? await fixture.indexes.writeShards(WarpStream.from([
      new PropertyShard({
        shardKey: 'aa',
        schemaVersion: 2,
        entries: [['user:alice', { name: 'Alice' }]],
      }),
    ]), { memberStorage: 'page', expectedShardCount: 1, maxShardBytes: 1024 })
    : null;
  const roots = new MaterializationRoots({
    adjacency: MaterializationRoot.retained(
      new BundleHandle(adjacency.handle.toString()),
    ),
    edgeAlive: unavailable(),
    edgeBirths: unavailable(),
    frontier: unavailable(),
    nodeAlive: unavailable(),
    properties: propertyRoot === null
      ? unavailable()
      : MaterializationRoot.retained(propertyRoot),
    provenanceSupport: unavailable(),
    replayBasis: unavailable(),
    roaringIndexes: indexRoot === null
      ? unavailable()
      : MaterializationRoot.retained(indexRoot),
  });
  const stateHash = await computeStateHash(state, {
    codec: fixture.codec,
    crypto: fixture.crypto,
  });
  const materialization = await fixture.materializations.retain({
    coordinate,
    roots,
    stateHash,
    replayBasis: state,
    provenanceSupport: ProvenanceIndex.empty(),
  });
  return {
    graphName: 'test',
    state,
    frontier,
    appliedVV: state.observedFrontier,
    stateHash,
    parents: options.parents ?? [],
    materialization,
  };
}

describe('CborCheckpointStoreAdapter materialization lifecycle', () => {
  it('is a CheckpointStorePort and requires every semantic dependency', () => {
    const { codec, crypto, history, assets, cas, checkpoints } = createFixture();
    expect(checkpoints).toBeInstanceOf(CheckpointStorePort);

    // @ts-expect-error Runtime dependency guard for JavaScript callers.
    expect(() => new CborCheckpointStoreAdapter({ crypto, commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC, history, assetStorage: assets, cas }))
      .toThrow(/codec/);
    // @ts-expect-error Runtime dependency guard for JavaScript callers.
    expect(() => new CborCheckpointStoreAdapter({ codec, commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC, history, assetStorage: assets, cas }))
      .toThrow(/crypto/);
    // @ts-expect-error Runtime dependency guard for JavaScript callers.
    expect(() => new CborCheckpointStoreAdapter({ codec, crypto, history, assetStorage: assets, cas }))
      .toThrow(/commitMessageCodec/);
  });

  it('publishes the exact retained materialization and round-trips state', async () => {
    const fixture = createFixture();
    const input = await record(fixture);
    const published = await fixture.checkpoints.publishCheckpoint(input);
    const loaded = await fixture.checkpoints.loadCheckpoint(published.checkpointSha);

    expect(published.bundleHandle.toString()).toBe(input.materialization?.bundle.toString());
    expect(await fixture.checkpoints.resolveHead('test')).toBe(published.checkpointSha);
    expect(loaded.stateHash).toBe(input.stateHash);
    expect(loaded.state.nodeAlive.contains('user:alice')).toBe(true);
    expect(loaded.state.edgeAlive.contains('user:alice\0user:bob\0knows')).toBe(true);
    expect(loaded.frontier).toEqual(input.frontier);
    expect(loaded.appliedVV?.get('w1')).toBe(3);
    expect(loaded.indexShardHandles).toBeNull();
    expect(loaded.indexRoot).toBeNull();
    expect(loaded.propertyRoot).toBeNull();
    expect(loaded.provenanceIndex?.toJSON()).toEqual(ProvenanceIndex.empty().toJSON());
    expect(published.retention.reachability).toBe('anchored');
  });

  it('reads metadata without opening materialization payloads', async () => {
    const fixture = createFixture();
    const input = await record(fixture);
    const published = await fixture.checkpoints.publishCheckpoint(input);
    const open = vi.fn(fixture.cas.assets.open);
    const getPage = vi.fn(fixture.cas.pages.get);
    const metadataReader = checkpointAdapter(fixture, {
      assets: { open },
      pages: { get: getPage },
      bundles: fixture.cas.bundles,
      publications: fixture.cas.publications,
    });

    await expect(metadataReader.readMetadata(published.checkpointSha)).resolves.toEqual({
      checkpointSha: published.checkpointSha,
      stateHash: input.stateHash,
      schema: 5,
    });
    expect(open).not.toHaveBeenCalled();
    expect(getPage).not.toHaveBeenCalled();
  });

  it('exposes retained logical and property roots as the bounded basis', async () => {
    const fixture = createFixture();
    const published = await fixture.checkpoints.publishCheckpoint(
      await record(fixture, { indexes: true }),
    );
    const basis = await fixture.checkpoints.loadBasis(published.checkpointSha);

    expect(basis.indexRoot).not.toBeNull();
    expect(basis.propertyRoot).not.toBeNull();
    expect(basis.indexShardHandles).toEqual({});
    expect(basis.frontier).toEqual(new Map([['w1', 'a'.repeat(40)]]));
  });

  it('fails closed when a retained materialization has no bounded indexes', async () => {
    const fixture = createFixture();
    const published = await fixture.checkpoints.publishCheckpoint(await record(fixture));
    await expect(fixture.checkpoints.loadBasis(published.checkpointSha))
      .rejects.toMatchObject({ code: 'E_CHECKPOINT_MISSING_INDEX' });
  });

  it('rejects graph mismatches before opening materialization payloads', async () => {
    const fixture = createFixture();
    const published = await fixture.checkpoints.publishCheckpoint(await record(fixture));
    const open = vi.fn(fixture.cas.assets.open);
    const guardedReader = checkpointAdapter(fixture, {
      assets: { open },
      pages: fixture.cas.pages,
      bundles: fixture.cas.bundles,
      publications: fixture.cas.publications,
    });

    await expect(guardedReader.loadCheckpoint(published.checkpointSha, 'other'))
      .rejects.toMatchObject({ code: 'E_CHECKPOINT_GRAPH_MISMATCH' });
    expect(open).not.toHaveBeenCalled();
  });

  it('rejects publication without a retained materialization', async () => {
    const fixture = createFixture();
    const input = await record(fixture);
    const { materialization: _materialization, ...missing } = input;
    await expect(fixture.checkpoints.publishCheckpoint(missing))
      .rejects.toMatchObject({ code: 'E_CHECKPOINT_MISSING_MATERIALIZATION' });
  });

  it('rejects materialization state-hash and coordinate mismatches', async () => {
    const fixture = createFixture();
    const input = await record(fixture);
    await expect(fixture.checkpoints.publishCheckpoint({
      ...input,
      stateHash: 'f'.repeat(64),
    })).rejects.toMatchObject({ code: 'E_CHECKPOINT_MATERIALIZATION_MISMATCH' });

    const retained = input.materialization;
    if (retained === undefined) {
      throw new Error('expected retained materialization');
    }
    const ceiling = new MaterializationHandle({
      laneName: retained.laneName,
      bundle: retained.bundle,
      coordinate: new MaterializationCoordinate({
        frontier: retained.coordinate.frontier(),
        ceiling: 1,
      }),
      roots: retained.roots,
      stateHash: retained.stateHash,
      retention: retained.retention,
    });
    await expect(fixture.checkpoints.publishCheckpoint({
      ...input,
      materialization: ceiling,
    })).rejects.toMatchObject({ code: 'E_CHECKPOINT_MATERIALIZATION_MISMATCH' });
  });

  it('rejects publication and retention witnesses for another bundle', async () => {
    const fixture = createFixture();
    const input = await record(fixture);
    const other = await fixture.cas.bundles.putOrdered({ members: [] });
    const publicationMismatch: GitCasCheckpointFacade = {
      assets: fixture.cas.assets,
      pages: fixture.cas.pages,
      bundles: fixture.cas.bundles,
      publications: {
        commit: async (request) => {
          const publication = await fixture.cas.publications.commit(request);
          return Object.freeze({ ...publication, root: other.handle });
        },
      },
    };
    await expect(checkpointAdapter(fixture, publicationMismatch).publishCheckpoint(input))
      .rejects.toMatchObject({ code: 'E_CHECKPOINT_PUBLICATION_MISMATCH' });

    const retentionMismatch: GitCasCheckpointFacade = {
      assets: fixture.cas.assets,
      pages: fixture.cas.pages,
      bundles: fixture.cas.bundles,
      publications: {
        commit: async (request) => {
          const publication = await fixture.cas.publications.commit(request);
          return Object.freeze({
            ...publication,
            witness: new RetentionWitness({
              handle: other.handle,
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
            }),
          });
        },
      },
    };
    await expect(checkpointAdapter(fixture, retentionMismatch).publishCheckpoint(input))
      .rejects.toMatchObject({ code: 'E_CHECKPOINT_RETENTION_MISMATCH' });
  });

  it.each([
    [CHECKPOINT_STORAGE_FORMAT, 'E_CHECKPOINT_MISSING_BUNDLE_HANDLE'],
    ['future-checkpoint-layout', 'E_CHECKPOINT_UNSUPPORTED_STORAGE'],
  ])('rejects unsupported storage metadata %s', async (storageVersion, code) => {
    const fixture = createFixture();
    const sha = await fixture.history.commitNode({
      parents: [],
      message: malformedCheckpointMessage(storageVersion),
    });
    await expect(fixture.checkpoints.readMetadata(sha)).rejects.toMatchObject({ code });
  });

  it('publishes coverage as a causal anchor of checkpoint parents', async () => {
    const fixture = createFixture();
    const published = await fixture.checkpoints.publishCheckpoint(await record(fixture));
    const anchor = await fixture.checkpoints.publishCoverage({
      graphName: 'test',
      parents: [published.checkpointSha],
    });
    expect(DEFAULT_COMMIT_MESSAGE_CODEC.detectKind(
      (await fixture.history.getNodeInfo(anchor)).message,
    )).toBe('anchor');
  });
});

function checkpointAdapter(
  fixture: ReturnType<typeof createFixture>,
  cas: GitCasCheckpointFacade,
): CborCheckpointStoreAdapter {
  return new CborCheckpointStoreAdapter({
    codec: fixture.codec,
    crypto: fixture.crypto,
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
