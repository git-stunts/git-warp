/**
 * A checkpoint written by a runtime that predates descriptor schema 6 is a
 * miss, not an error.
 *
 * 19.1.0 wrote checkpoints whose materialization descriptor carries schema 5
 * and whose replay basis is full-v5: state built without the node lifecycle
 * rule. The current runtime must not throw on such a checkpoint, and must not
 * resume from it either. It replays from patches instead, so the new
 * visibility applies to history before the checkpoint.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import ContentAddressableStore, { type AssetHandle } from '@git-stunts/git-cas';
import { buildCheckpointRef } from '../../../src/domain/utils/RefLayout.ts';
import { computeStateHash, projectState } from '../../../src/domain/services/state/StateSerializer.ts';
import { decodeCanonicalWarpFullState } from '../../../src/infrastructure/codecs/WarpStateCborCodec.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import BundleHandle from '../../../src/domain/storage/BundleHandle.ts';
import GitCasRepositoryAdapter from '../../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import type RuntimeStorageProviderPort from '../../../src/ports/RuntimeStorageProviderPort.ts';
import type { RuntimeStorageRequest, RuntimeStorageServices } from '../../../src/ports/RuntimeStorageProviderPort.ts';
import { createTestRepo } from './helpers/setup.ts';

const GRAPH = 'upgrade';
const OLDER_DESCRIPTOR_SCHEMA_VERSION = 5;
const DESCRIPTOR_PATH = 'meta/descriptor';
const REPLAY_BASIS_MEMBER = 'roots/replay-basis';
const REPLAY_BASIS_ASSET = 'state.cbor';
const MATERIALIZATION_CACHE_NAMESPACE = 'git-warp/materializations';

type TestRepo = Awaited<ReturnType<typeof createTestRepo>>;

type FullStateLegacyFields = Readonly<{
  nodeAlive: object;
  edgeAlive: object;
  prop: object;
  observedFrontier: object;
  edgeBirthEvent: object;
}>;

type ForgedCheckpoint = Readonly<{
  checkpointSha: string;
  visibleProps: ReturnType<typeof projectState>['props'];
}>;

async function readBytes(source: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of source) {
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

async function* single(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield bytes;
}

/** Re-encodes a full-v6 replay basis as the full-v5 bytes 19.1.0 wrote. */
function fullV5Bytes(repo: TestRepo, fullV6: Uint8Array): Uint8Array {
  const { nodeAlive, edgeAlive, prop, observedFrontier, edgeBirthEvent } =
    repo.codec.decode<FullStateLegacyFields>(fullV6);
  return repo.codec.encode({
    version: 'full-v5',
    nodeAlive,
    edgeAlive,
    prop,
    observedFrontier,
    edgeBirthEvent,
  });
}

/**
 * Rewrites the head checkpoint as 19.1.0 left it: a schema 5 descriptor, a
 * full-v5 replay basis and the state hash of that basis.
 */
async function forgeOlderCheckpoint(repo: TestRepo, checkpointSha: string): Promise<ForgedCheckpoint> {
  const cas = ContentAddressableStore.createCbor({
    plumbing: repo.plumbing,
    chunking: { strategy: 'cdc' },
    applicationRefPrefixes: ['refs/warp/'],
  });
  try {
    const message = DEFAULT_COMMIT_MESSAGE_CODEC.decodeCheckpoint(await repo.persistence.showNode(checkpointSha));
    const members: Array<[string, string]> = [];
    for await (const member of cas.bundles.iterateMemberReferences({ handle: message.bundleHandle.toString() })) {
      members.push([member.path, member.handle.toString()]);
    }
    const replayBundle = requireMember(members, REPLAY_BASIS_MEMBER);
    const replayAsset = await cas.bundles.getMemberReference({ handle: replayBundle, path: REPLAY_BASIS_ASSET });
    if (replayAsset === null || replayAsset.handle.kind !== 'asset') {
      throw new Error('expected a replay basis asset');
    }
    const assetHandle: AssetHandle = replayAsset.handle;
    const legacyBytes = fullV5Bytes(repo, await readBytes(cas.assets.open({ handle: assetHandle })));
    const legacyState = decodeCanonicalWarpFullState(legacyBytes, repo.codec);
    const legacyHash = await computeStateHash(legacyState, { codec: repo.codec, crypto: repo.crypto });

    const asset = await cas.assets.put({
      source: single(legacyBytes),
      slug: 'git-warp-materialization-replay-basis',
      filename: REPLAY_BASIS_ASSET,
    });
    const legacyReplayBundle = await cas.bundles.putOrdered({
      members: [[REPLAY_BASIS_ASSET, asset.handle]],
    });
    const descriptor = repo.codec.decode<Readonly<{ stateHash: string }>>(
      await cas.pages.get({ handle: requireMember(members, DESCRIPTOR_PATH) }),
    );
    const legacyDescriptor = await cas.pages.put({
      source: repo.codec.encode({
        ...descriptor,
        schemaVersion: OLDER_DESCRIPTOR_SCHEMA_VERSION,
        stateHash: legacyHash,
      }),
    });
    const legacyRoot = await cas.bundles.putOrdered({
      members: members.map(([path, handle]): [string, string] => {
        if (path === DESCRIPTOR_PATH) {
          return [path, legacyDescriptor.handle.toString()];
        }
        if (path === REPLAY_BASIS_MEMBER) {
          return [path, legacyReplayBundle.handle.toString()];
        }
        return [path, handle];
      }),
    });
    const published = await cas.publications.commit({
      root: legacyRoot.handle,
      commit: {
        parents: [checkpointSha],
        message: DEFAULT_COMMIT_MESSAGE_CODEC.encodeCheckpoint({
          ...message,
          stateHash: legacyHash,
          bundleHandle: new BundleHandle(legacyRoot.handle.toString()),
        }),
      },
      ref: { name: buildCheckpointRef(GRAPH), expected: checkpointSha },
    });
    // 19.1.0 left its cache entries under schema 5 keys, which this runtime
    // never looks up. Dropping the entries this runtime just wrote leaves the
    // cache as the upgrade finds it.
    const cache = await cas.caches.open({ namespace: MATERIALIZATION_CACHE_NAMESPACE });
    for (const entry of (await cache.inspect()).entries) {
      await cache.remove(entry.key);
    }
    return { checkpointSha: published.commitId, visibleProps: projectState(legacyState).props };
  } finally {
    await cas.close();
  }
}

function requireMember(members: ReadonlyArray<[string, string]>, path: string): string {
  const member = members.find(([candidate]) => candidate === path);
  if (member === undefined) {
    throw new Error(`expected checkpoint member ${path}`);
  }
  return member[1];
}

describe('API: checkpoint written before descriptor schema 6', () => {
  let repo: TestRepo | null = null;

  beforeEach(async () => {
    repo = await createTestRepo('checkpoint-descriptor-upgrade');
  });

  afterEach(async () => {
    await repo?.cleanup();
  });

  it('replays from patches and applies lifecycle visibility to history before the checkpoint', async () => {
    if (repo === null) {
      throw new Error('Test repository is not initialized');
    }
    const writer = await repo.openGraph(GRAPH, 'w1');
    await (await writer.createPatch()).addNode('n').setProperty('n', 'color', 'red').commit();
    await writer.materialize();
    await (await writer.createPatch()).removeNode('n').commit();
    await writer.materialize();
    await (await writer.createPatch()).addNode('n').commit();
    await writer.materialize();
    const forged = await forgeOlderCheckpoint(repo, await writer.createCheckpoint());

    // The forged checkpoint shows what resuming from it would show.
    expect(forged.visibleProps).toEqual([{ node: 'n', key: 'color', value: 'red' }]);

    const upgraded = await repo.openGraph(GRAPH, 'w1');
    await expect(upgraded.materialize()).resolves.toBeDefined();
    expect(await upgraded.getNodes()).toEqual(['n']);
    expect(await upgraded.getNodeProps('n')).toEqual({});

    const rewritten = await upgraded.createCheckpoint();
    expect(rewritten).not.toBe(forged.checkpointSha);
    const reopened = await repo.openGraph(GRAPH, 'w1');
    await reopened.materialize();
    expect(await reopened.getNodeProps('n')).toEqual({});
  });

  it('rebuilds an explicit materializeAt of the checkpoint from patches', async () => {
    if (repo === null) {
      throw new Error('Test repository is not initialized');
    }
    const writer = await repo.openGraph(GRAPH, 'w1');
    await (await writer.createPatch()).addNode('n').setProperty('n', 'color', 'red').commit();
    await writer.materialize();
    await (await writer.createPatch()).removeNode('n').commit();
    await writer.materialize();
    await (await writer.createPatch()).addNode('n').commit();
    await writer.materialize();
    const forged = await forgeOlderCheckpoint(repo, await writer.createCheckpoint());
    await (await writer.createPatch()).setProperty('n', 'size', 'large').commit();

    // materializeAt() runs only on a runtime without a trie store; the
    // session-backed line refuses it before reading any checkpoint.
    const storage = new GitCasRepositoryAdapter({ plumbing: repo.plumbing, history: repo.persistence });
    try {
      const reader = await repo.openGraph(GRAPH, 'w1', { runtimeStorage: withoutTrieStore(storage) });
      const state = await reader.materializeAt(forged.checkpointSha);
      expect([...state.nodeAlive.elements()]).toEqual(['n']);
      expect(await reader.getNodeProps('n')).toEqual({ size: 'large' });
    } finally {
      await storage.close();
    }
  });
});

/** Supplies the repository's storage services without the trie store. */
function withoutTrieStore(storage: RuntimeStorageProviderPort): RuntimeStorageProviderPort {
  return {
    async createRuntimeStorageServices(request: RuntimeStorageRequest): Promise<RuntimeStorageServices> {
      const { trie, ...services } = await storage.createRuntimeStorageServices(request);
      expect(trie).toBeDefined();
      return services;
    },
  };
}
