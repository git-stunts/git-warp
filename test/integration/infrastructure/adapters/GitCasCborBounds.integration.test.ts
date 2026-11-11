import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Plumbing from '@git-stunts/plumbing';
import ContentAddressableStore, {
  BundleHandle as GitCasBundleHandle,
  CborCodec as GitCasCborCodec,
} from '@git-stunts/git-cas';
import { afterEach, describe, expect, it } from 'vitest';

import GitCasRepositoryAdapter, {
  WARP_APPLICATION_REF_PREFIXES,
} from '../../../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import BoundedGitCasCborCodec from '../../../../src/infrastructure/adapters/BoundedGitCasCborCodec.ts';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import MessageCodecError from '../../../../src/domain/errors/MessageCodecError.ts';
import BundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import warpCborCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { buildTrustRecordRef } from '../../../../src/domain/utils/RefLayout.ts';
import { OUT_OF_BOUNDS_CBOR } from '../../../helpers/OutOfBoundsCborCorpus.ts';

type PlumbingInstance = Awaited<ReturnType<typeof Plumbing.createDefault>>;

type OpenedRepository = {
  readonly plumbing: PlumbingInstance;
  readonly history: GitTimelineHistoryAdapter;
  readonly repository: GitCasRepositoryAdapter;
};

const GRAPH = 'bounds';
/** git-cas splits a manifest with more chunks than this into Merkle sub-manifests. */
const GIT_CAS_MERKLE_THRESHOLD = 1_000;
const MAX_CBOR_DECODE_BYTES = 5 * 1024 * 1024;
const MANIFEST_ENTRY = 'manifest.cbor';
const SUB_MANIFEST_ENTRY = 'sub-manifest-0.cbor';
const BUNDLE_ROOT_ENTRY = 'bundle.cbor';
const opened: OpenedRepository[] = [];
const tempDirectories: string[] = [];

afterEach(async () => {
  const repositories = opened.splice(0);
  await Promise.allSettled(repositories.map(async (entry) => {
    await entry.repository.close();
    await entry.history.close();
  }));
  const directories = tempDirectories.splice(0);
  await Promise.all(directories.map(async (directory) => {
    await rm(directory, { recursive: true, force: true });
  }));
});

describe('git-cas CBOR decode bounds in the default GitCasRepositoryAdapter runtime', () => {
  it.each(OUT_OF_BOUNDS_CBOR)('refuses an asset manifest with $name', async ({ bytes, reason }) => {
    const { history, repository } = await openRepository();
    const treeOid = await writeManifestTree(history, bytes);

    const read = readAsset(repository, treeOid);

    await expect(read).rejects.toBeInstanceOf(MessageCodecError);
    await expect(read).rejects.toMatchObject({ code: 'E_CBOR_DECODE_BOUNDS', context: { reason } });
  });

  it('reads a Merkle asset that git-cas wrote', async () => {
    const { plumbing, history, repository } = await openRepository();
    const content = deterministicBytes(300_000);

    const treeOid = await writeMerkleAsset(plumbing, content);

    expect(Object.keys(await history.readTreeOids(treeOid))).toContain(SUB_MANIFEST_ENTRY);
    expect(await readAsset(repository, treeOid)).toEqual(content);
  });

  it.each(OUT_OF_BOUNDS_CBOR)('refuses a Merkle sub-manifest with $name', async ({ bytes, reason }) => {
    const { plumbing, history, repository } = await openRepository();
    const merkleTreeOid = await writeMerkleAsset(plumbing, deterministicBytes(300_000));
    const treeOid = await replaceSubManifest(history, merkleTreeOid, bytes);

    const read = readAsset(repository, treeOid);

    await expect(read).rejects.toBeInstanceOf(MessageCodecError);
    await expect(read).rejects.toMatchObject({ code: 'E_CBOR_DECODE_BOUNDS', context: { reason } });
  });

  it.each(OUT_OF_BOUNDS_CBOR)('refuses a bundle root descriptor with $name', async ({ bytes, reason }) => {
    const { plumbing, history, repository } = await openRepository();
    const bundleHandle = await replaceBundleRootDescriptor(history, await writeBundle(plumbing), bytes);
    const services = await repository.createRuntimeStorageServices({
      timelineName: GRAPH,
      codec: warpCborCodec,
      crypto: new NodeCryptoAdapter(),
      commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
    });

    const read = services.indexes.readShardHandles(bundleHandle);

    await expect(read).rejects.toMatchObject({
      code: 'BUNDLE_CORRUPT',
      meta: {
        descriptorKind: 'root',
        originalError: { name: 'MessageCodecError', code: 'E_CBOR_DECODE_BOUNDS', context: { reason } },
      },
    });
  });

  it.each(OUT_OF_BOUNDS_CBOR)('refuses a trust record with $name', async ({ bytes, reason }) => {
    const { plumbing, repository } = await openRepository();
    await publishTrustRecordBytes(repository, bytes);
    const trustChain = repository.createTrustChain(new NodeCryptoAdapter());

    const tip = trustChain.readTip(GRAPH);

    await expect(tip).rejects.toBeInstanceOf(MessageCodecError);
    await expect(tip).rejects.toMatchObject({ code: 'E_CBOR_DECODE_BOUNDS', context: { reason } });
    expect(await plumbing.execute({ args: ['rev-parse', buildTrustRecordRef(GRAPH)] })).toMatch(/^[0-9a-f]{40}/u);
  });

  it('reads a normal trust record tip through the bounded codec', async () => {
    const { repository } = await openRepository();
    await publishTrustRecordBytes(repository, new GitCasCborCodec().encode({ recordId: 'record-1' }));

    const tip = await repository.createTrustChain(new NodeCryptoAdapter()).readTip(GRAPH);

    expect(tip?.recordId).toBe('record-1');
  });

  it('writes the same manifest tree as createCbor and reads the asset back', async () => {
    const { plumbing, history, repository } = await openRepository();
    const content = deterministicBytes(1_200_000);
    const reference = ContentAddressableStore.createCbor({
      plumbing,
      chunking: { strategy: 'cdc' },
      applicationRefPrefixes: [...WARP_APPLICATION_REF_PREFIXES],
    });

    const bounded = await repository.observationStorage().assets.put(assetOptions(content));
    const unbounded = await reference.assets.put(assetOptions(content));
    await reference.close();

    expect(bounded.handle.oid).toBe(unbounded.handle.oid);
    expect(bounded.handle.codec).toBe('cbor');
    const manifestOid = (await history.readTreeOids(bounded.handle.oid))[MANIFEST_ENTRY] ?? '';
    const manifest = new GitCasCborCodec().decode(await history.readBlob(manifestOid));
    const chunks: unknown = Reflect.get(manifest, 'chunks');
    expect(Array.isArray(chunks) && chunks.length > 1).toBe(true);
    expect(await readAsset(repository, bounded.handle.oid)).toEqual(content);
  });

  it('admits a flat manifest at the git-cas Merkle threshold built from a written chunk entry', async () => {
    const { history, repository } = await openRepository();
    const staged = await repository.observationStorage().assets.put(assetOptions(deterministicBytes(300_000)));
    const manifestOid = (await history.readTreeOids(staged.handle.oid))[MANIFEST_ENTRY] ?? '';
    const manifest = new GitCasCborCodec().decode(await history.readBlob(manifestOid));
    const writtenChunks: unknown = Reflect.get(manifest, 'chunks');
    const chunk: unknown = Array.isArray(writtenChunks) ? writtenChunks[0] : null;
    const thresholdChunks = Array.from({ length: GIT_CAS_MERKLE_THRESHOLD }, (_, index) => ({
      ...(typeof chunk === 'object' ? chunk : {}),
      index,
    }));
    const codec = new BoundedGitCasCborCodec();

    const bytes = codec.encode({ ...manifest, chunks: thresholdChunks });

    expect(Reflect.get(codec.decode(bytes), 'chunks')).toHaveLength(GIT_CAS_MERKLE_THRESHOLD);
    expect(bytes.byteLength).toBeLessThan(MAX_CBOR_DECODE_BYTES / 10);
  });
});

async function openRepository(): Promise<OpenedRepository> {
  const directory = await mkdtemp(join(tmpdir(), 'git-warp-cas-cbor-bounds-'));
  tempDirectories.push(directory);
  const plumbing = await Plumbing.createDefault({ cwd: directory });
  await plumbing.execute({ args: ['init', '-q'] });
  await plumbing.execute({ args: ['config', 'user.email', 'test@test.com'] });
  await plumbing.execute({ args: ['config', 'user.name', 'Test'] });
  const history = new GitTimelineHistoryAdapter({ plumbing });
  const repository = new GitCasRepositoryAdapter({ plumbing, history });
  const entry: OpenedRepository = { plumbing, history, repository };
  opened.push(entry);
  return entry;
}

/** An asset written by git-cas's own store with a Merkle threshold of one chunk, so it has sub-manifests. */
async function writeMerkleAsset(plumbing: PlumbingInstance, content: Uint8Array): Promise<string> {
  const writer = ContentAddressableStore.createCbor({
    plumbing,
    chunking: { strategy: 'cdc' },
    merkleThreshold: 1,
    applicationRefPrefixes: [...WARP_APPLICATION_REF_PREFIXES],
  });
  try {
    return (await writer.assets.put(assetOptions(content))).handle.oid;
  } finally {
    await writer.close();
  }
}

/** The Merkle tree with its first sub-manifest blob replaced by `bytes`, and a root manifest that points at it. */
async function replaceSubManifest(
  history: GitTimelineHistoryAdapter,
  treeOid: string,
  bytes: Uint8Array,
): Promise<string> {
  const codec = new GitCasCborCodec();
  const subManifestOid = await history.writeBlob(bytes);
  const entries = await history.readTreeObjectEntries(treeOid);
  const rootOid = entries.find((entry) => entry.name === MANIFEST_ENTRY)?.oid ?? '';
  const root = codec.decode(await history.readBlob(rootOid));
  const subManifests: unknown = Reflect.get(root, 'subManifests');
  const refs: unknown[] = Array.isArray(subManifests) ? subManifests : [];
  const unhashed = {
    ...root,
    subManifests: refs.map((ref, index) => (index === 0 && typeof ref === 'object' ? { ...ref, oid: subManifestOid } : ref)),
  };
  Reflect.deleteProperty(unhashed, 'manifestHash');
  const manifestHash = createHash('sha256').update(codec.encode(unhashed)).digest('hex');
  const rootManifestOid = await history.writeBlob(codec.encode({ ...unhashed, manifestHash }));
  const replaced = new Map([[MANIFEST_ENTRY, rootManifestOid], [SUB_MANIFEST_ENTRY, subManifestOid]]);
  return await history.writeTree(entries.map((entry) => {
    const oid = replaced.get(entry.name) ?? entry.oid;
    return `${entry.mode} ${entry.type} ${oid}\t${entry.name}`;
  }));
}

/** A one-member bundle written by git-cas's own store. */
async function writeBundle(plumbing: PlumbingInstance): Promise<GitCasBundleHandle> {
  const writer = ContentAddressableStore.createCbor({
    plumbing,
    chunking: { strategy: 'cdc' },
    applicationRefPrefixes: [...WARP_APPLICATION_REF_PREFIXES],
  });
  try {
    const member = await writer.assets.put(assetOptions(deterministicBytes(1_000)));
    return (await writer.bundles.putOrdered({ members: [['member', member.handle.toString()]] })).handle;
  } finally {
    await writer.close();
  }
}

/** The bundle with its root descriptor blob replaced by `bytes`. */
async function replaceBundleRootDescriptor(
  history: GitTimelineHistoryAdapter,
  handle: GitCasBundleHandle,
  bytes: Uint8Array,
): Promise<BundleHandle> {
  const descriptorOid = await history.writeBlob(bytes);
  const entries = await history.readTreeObjectEntries(handle.oid);
  expect(entries.map((entry) => entry.name)).toContain(BUNDLE_ROOT_ENTRY);
  const treeOid = await history.writeTree(entries.map((entry) => {
    const oid = entry.name === BUNDLE_ROOT_ENTRY ? descriptorOid : entry.oid;
    return `${entry.mode} ${entry.type} ${oid}\t${entry.name}`;
  }));
  return new BundleHandle(new GitCasBundleHandle({ codec: handle.codec, oid: treeOid }).toString());
}

async function writeManifestTree(history: GitTimelineHistoryAdapter, bytes: Uint8Array): Promise<string> {
  const blobOid = await history.writeBlob(bytes);
  return await history.writeTree([`100644 blob ${blobOid}\t${MANIFEST_ENTRY}`]);
}

async function readAsset(repository: GitCasRepositoryAdapter, treeOid: string): Promise<Uint8Array> {
  const assets = repository.observationStorage().assets;
  const staged = await assets.adopt({ treeOid });
  const parts: Uint8Array[] = [];
  for await (const part of assets.open({ handle: staged.handle })) {
    parts.push(part);
  }
  return Uint8Array.from(parts.flatMap((part) => [...part]));
}

async function publishTrustRecordBytes(repository: GitCasRepositoryAdapter, bytes: Uint8Array): Promise<void> {
  const storage = repository.observationStorage();
  const staged = await storage.assets.put(assetOptions(bytes));
  await storage.publications.commit({
    root: staged.handle,
    commit: { message: 'trust: test record', parents: [] },
    ref: { name: buildTrustRecordRef(GRAPH), expected: null },
  });
}

function assetOptions(bytes: Uint8Array): { source: AsyncIterable<Uint8Array>; slug: string; filename: string } {
  return { source: singleChunk(bytes), slug: 'bounds-asset', filename: 'record.cbor' };
}

async function* singleChunk(bytes: Uint8Array): AsyncIterable<Uint8Array> {
  yield bytes;
}

/** Bytes with enough variation for content-defined chunking to cut several chunks. */
function deterministicBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let state = 0x9e3779b9;
  for (let index = 0; index < length; index += 1) {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    bytes[index] = state >>> 24;
  }
  return bytes;
}
