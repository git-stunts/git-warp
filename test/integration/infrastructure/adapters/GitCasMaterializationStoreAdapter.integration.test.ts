import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import ContentAddressableStore, {
  BundleHandle as GitCasBundleHandle,
} from '@git-stunts/git-cas';
import Plumbing from '@git-stunts/plumbing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import MaterializationCoordinate from '../../../../src/domain/materialization/MaterializationCoordinate.ts';
import MaterializationRoot from '../../../../src/domain/materialization/MaterializationRoot.ts';
import MaterializationRoots from '../../../../src/domain/materialization/MaterializationRoots.ts';
import BundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import GitCasRepositoryAdapter from '../../../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import GitCasTrieStoreAdapter from '../../../../src/infrastructure/adapters/GitCasTrieStoreAdapter.ts';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import type MaterializationStorePort from '../../../../src/ports/MaterializationStorePort.ts';

const execFileAsync = promisify(execFile);

describe('GitCasMaterializationStoreAdapter integration', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(async () => {
    await rm(harness.path, { recursive: true, force: true });
  });

  it('retains the materialization graph and resumes from a fresh repository adapter', async () => {
    const coordinate = new MaterializationCoordinate({
      frontier: new Map([['writer-a', 'a'.repeat(40)]]),
      ceiling: null,
    });
    const trieFixture = await createTrieRoot(harness.cas);
    const rootFixture = await createRoots(harness.cas, trieFixture);
    const retained = await harness.materializations.retain({
      coordinate,
      roots: rootFixture.roots,
      stateHash: 'state-hash',
    });

    const reopenedCas = createCas(harness.plumbing);
    const reopened = await createMaterializations(
      harness.plumbing,
      reopenedCas,
    );
    const resolved = await reopened.findExact(coordinate);
    if (resolved === null) {
      throw new Error('Retained materialization was not reopened');
    }
    const nodeAliveRoot = resolved.roots.nodeAlive.handle;
    if (nodeAliveRoot === null) {
      throw new Error('Retained materialization did not expose its node root');
    }
    const reopenedTrie = new GitCasTrieStoreAdapter({ cas: reopenedCas });
    const children = await reopenedTrie.readBranch(nodeAliveRoot.toString());
    const child = children.get(0);
    if (child === undefined) {
      throw new Error('Retained trie root did not contain its leaf child');
    }
    const unreachable = await prunableOids(harness.path);

    expect(resolved.bundle.equals(retained.bundle)).toBe(true);
    expect(resolved.roots.entries().map(([name, root]) => rootSignature(name, root)))
      .toEqual(rootFixture.roots.entries().map(([name, root]) => rootSignature(name, root)));
    expect(await reopenedTrie.readLeaf(child)).toEqual(trieFixture.bytes);
    expect(unreachable).not.toContain(GitCasBundleHandle.parse(retained.bundle.toString()).oid);
    for (const oid of rootFixture.retainedOids) {
      expect(unreachable).not.toContain(oid);
    }
    expect(await harness.plumbing.execute({
      args: ['show-ref', '--verify', '--hash', 'refs/cas/caches/git-warp/materializations'],
    })).toMatch(/^[0-9a-f]{40}\n?$/u);
  });
});

type Harness = Readonly<{
  cas: ContentAddressableStore;
  materializations: MaterializationStorePort;
  path: string;
  plumbing: Awaited<ReturnType<typeof Plumbing.createDefault>>;
}>;

async function createHarness(): Promise<Harness> {
  const path = await mkdtemp(join(tmpdir(), 'git-warp-materializations-'));
  const plumbing = await Plumbing.createDefault({ cwd: path });
  await plumbing.execute({ args: ['init', '-q'] });
  await plumbing.execute({ args: ['config', 'user.email', 'test@example.com'] });
  await plumbing.execute({ args: ['config', 'user.name', 'Test'] });
  const cas = createCas(plumbing);
  return Object.freeze({
    cas,
    path,
    plumbing,
    materializations: await createMaterializations(plumbing, cas),
  });
}

function createCas(
  plumbing: Awaited<ReturnType<typeof Plumbing.createDefault>>,
): ContentAddressableStore {
  return ContentAddressableStore.createCbor({
    plumbing,
    chunking: { strategy: 'cdc' },
    applicationRefPrefixes: ['refs/warp/'],
  });
}

async function createMaterializations(
  plumbing: Awaited<ReturnType<typeof Plumbing.createDefault>>,
  cas: ContentAddressableStore,
): Promise<MaterializationStorePort> {
  const history = new GitTimelineHistoryAdapter({ plumbing });
  const repository = new GitCasRepositoryAdapter({ plumbing, history, cas });
  const services = await repository.createRuntimeStorageServices({
    timelineName: 'events',
    codec: defaultCodec,
    crypto: new NodeCryptoAdapter(),
    commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
  });
  return services.materializations;
}

type TrieRootFixture = Readonly<{
  bytes: Uint8Array;
  retainedOids: readonly string[];
  root: BundleHandle;
}>;

async function createTrieRoot(cas: ContentAddressableStore): Promise<TrieRootFixture> {
  const adapter = new GitCasTrieStoreAdapter({ cas });
  const bytes = new Uint8Array([7, 8, 9]);
  const leafRoot = await adapter.writeLeaf(bytes);
  const branchRoot = await adapter.writeBranch(new Map([[0, leafRoot]]));
  const leafMember = await cas.bundles.getMember({
    handle: leafRoot,
    path: 'leaf/data',
  });
  if (leafMember === null || leafMember.handle.kind !== 'page') {
    throw new Error('Trie integration fixture did not create a leaf page');
  }
  return Object.freeze({
    bytes,
    retainedOids: Object.freeze([
      GitCasBundleHandle.parse(branchRoot).oid,
      GitCasBundleHandle.parse(leafRoot).oid,
      leafMember.handle.oid,
    ]),
    root: new BundleHandle(branchRoot),
  });
}

async function createRoots(
  cas: ContentAddressableStore,
  trie: TrieRootFixture,
): Promise<Readonly<{
  retainedOids: readonly string[];
  roots: MaterializationRoots;
}>> {
  const handles: BundleHandle[] = [];
  const retainedOids: string[] = [];
  for (let index = 0; index < 8; index += 1) {
    if (index === 4) {
      handles.push(trie.root);
      retainedOids.push(...trie.retainedOids);
      continue;
    }
    const page = await cas.pages.put({ source: new Uint8Array([index]) });
    const bundle = await cas.bundles.put({ members: { root: page.handle } });
    handles.push(new BundleHandle(bundle.handle.toString()));
    retainedOids.push(page.handle.oid, bundle.handle.oid);
  }
  return Object.freeze({
    retainedOids: Object.freeze(retainedOids),
    roots: rootsFromHandles(handles),
  });
}

function rootsFromHandles(handles: readonly BundleHandle[]): MaterializationRoots {
  const [
    adjacency,
    edgeAlive,
    edgeBirths,
    frontier,
    nodeAlive,
    properties,
    provenanceSupport,
    roaringIndexes,
  ] = handles;
  if (
    adjacency === undefined || edgeAlive === undefined || edgeBirths === undefined ||
    frontier === undefined || nodeAlive === undefined || properties === undefined ||
    provenanceSupport === undefined || roaringIndexes === undefined
  ) {
    throw new Error('Root integration fixture did not create every root');
  }
  return new MaterializationRoots({
    adjacency: MaterializationRoot.retained(adjacency),
    edgeAlive: MaterializationRoot.retained(edgeAlive),
    edgeBirths: MaterializationRoot.retained(edgeBirths),
    frontier: MaterializationRoot.retained(frontier),
    nodeAlive: MaterializationRoot.retained(nodeAlive),
    properties: MaterializationRoot.retained(properties),
    provenanceSupport: MaterializationRoot.retained(provenanceSupport),
    roaringIndexes: MaterializationRoot.retained(roaringIndexes),
  });
}

function rootSignature(
  name: string,
  root: MaterializationRoot,
): readonly [string, string, string | null] {
  return [name, root.status, root.handle?.toString() ?? null];
}

async function prunableOids(path: string): Promise<Set<string>> {
  const { stdout } = await execFileAsync(
    'git',
    ['-C', path, 'prune', '-n', '--expire=now'],
  );
  return new Set(
    stdout
      .split('\n')
      .map((line) => line.trim().split(/\s+/u)[0])
      .filter((oid): oid is string => oid !== undefined && oid.length > 0),
  );
}
