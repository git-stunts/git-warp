import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Plumbing from '@git-stunts/plumbing';
import ContentAddressableStore, { CborCodec as GitCasCborCodec } from '@git-stunts/git-cas';
import { afterEach, describe, expect, it } from 'vitest';

import GitCasRepositoryAdapter, {
  WARP_APPLICATION_REF_PREFIXES,
} from '../../../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import MessageCodecError from '../../../../src/domain/errors/MessageCodecError.ts';
import { buildTrustRecordRef } from '../../../../src/domain/utils/RefLayout.ts';
import { OUT_OF_BOUNDS_CBOR } from '../../../helpers/OutOfBoundsCborCorpus.ts';

type PlumbingInstance = Awaited<ReturnType<typeof Plumbing.createDefault>>;

type OpenedRepository = {
  readonly plumbing: PlumbingInstance;
  readonly history: GitTimelineHistoryAdapter;
  readonly repository: GitCasRepositoryAdapter;
};

const GRAPH = 'bounds';
const MANIFEST_ENTRY = 'manifest.cbor';
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
