import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ContentAddressableStore, {
  BundleHandle,
  PageHandle,
} from '@git-stunts/git-cas';
import Plumbing from '@git-stunts/plumbing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import GitCasTrieStoreAdapter from '../../../../src/infrastructure/adapters/GitCasTrieStoreAdapter.ts';

describe('GitCasTrieStoreAdapter integration', () => {
  let harness: Harness;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(async () => {
    try {
      await harness.cas.close();
    } finally {
      await rm(harness.path, { recursive: true, force: true });
    }
  });

  it('stores leaves as pages wrapped by bundle roots', async () => {
    const bytes = new Uint8Array([0, 1, 2, 255]);
    const root = await harness.adapter.writeLeaf(bytes);
    const bundle = BundleHandle.parse(root);
    const member = await harness.cas.bundles.getMember({
      handle: bundle,
      path: 'leaf/data',
    });
    if (member === null || member.handle.kind !== 'page') {
      throw new Error('Trie leaf bundle did not contain a page member');
    }

    expect(member.handle.kind).toBe('page');
    expect(PageHandle.from(member.handle)).toBeInstanceOf(PageHandle);
    expect(await harness.adapter.readLeaf(root)).toEqual(bytes);
  });

  it('stores branches as bundles of child bundle handles', async () => {
    const left = await harness.adapter.writeLeaf(new Uint8Array([1]));
    const right = await harness.adapter.writeLeaf(new Uint8Array([2]));
    const root = await harness.adapter.writeBranch(new Map([
      [0, left],
      [15, right],
    ]));

    expect([...await harness.adapter.readBranch(root)]).toEqual([
      [0, left],
      [15, right],
    ]);
    expect((await harness.cas.bundles.getMember({
      handle: root,
      path: 'children/0',
    }))?.handle.kind).toBe('bundle');
  });

  it('round-trips an empty branch bundle', async () => {
    const root = await harness.adapter.writeBranch(new Map());

    expect(await harness.adapter.readBranch(root)).toEqual(new Map());
  });
});

type Harness = Readonly<{
  adapter: GitCasTrieStoreAdapter;
  cas: ContentAddressableStore;
  path: string;
}>;

async function createHarness(): Promise<Harness> {
  const path = await mkdtemp(join(tmpdir(), 'git-warp-cas-trie-'));
  const plumbing = await Plumbing.createDefault({ cwd: path });
  await plumbing.execute({ args: ['init', '-q'] });
  const cas = ContentAddressableStore.createCbor({
    plumbing,
    chunking: { strategy: 'cdc' },
    applicationRefPrefixes: ['refs/warp/'],
  });
  return Object.freeze({
    adapter: new GitCasTrieStoreAdapter({ cas }),
    cas,
    path,
  });
}
