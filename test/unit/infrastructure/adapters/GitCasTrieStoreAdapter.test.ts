import { BundleHandle } from '@git-stunts/git-cas';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GitCasTrieStoreAdapter, {
  type GitCasTrieFacade,
} from '../../../../src/infrastructure/adapters/GitCasTrieStoreAdapter.ts';
import DomainBundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

describe('GitCasTrieStoreAdapter', () => {
  let adapter: GitCasTrieStoreAdapter;
  let cas: InMemoryGitCasFacade;

  beforeEach(() => {
    cas = new InMemoryGitCasFacade({
      history: new InMemoryGraphAdapter(),
      storage: new InMemoryBlobStorageAdapter(),
    });
    adapter = new GitCasTrieStoreAdapter({ cas });
  });

  it('round-trips deterministic leaf bundle roots', async () => {
    const bytes = new Uint8Array([0, 1, 2, 255]);

    const first = await adapter.writeLeaf(bytes);
    const second = await adapter.writeLeaf(bytes);

    expect(BundleHandle.parse(first).kind).toBe('bundle');
    expect(second).toBe(first);
    expect(await adapter.readLeaf(first)).toEqual(bytes);
    await expect(adapter.readBranch(first)).rejects.toMatchObject({
      code: 'E_TRIE_STORE_CORRUPT',
    });
  });

  it('round-trips deterministic, nibble-sorted branch bundles', async () => {
    const left = await adapter.writeLeaf(new Uint8Array([1]));
    const right = await adapter.writeLeaf(new Uint8Array([2]));

    const root = await adapter.writeBranch(new Map([
      [15, right],
      [0, left],
    ]));
    const reordered = await adapter.writeBranch(new Map([
      [0, left],
      [15, right],
    ]));

    expect(reordered).toBe(root);
    expect([...await adapter.readBranch(root)]).toEqual([
      [0, left],
      [15, right],
    ]);
    await expect(adapter.readLeaf(root)).rejects.toMatchObject({
      code: 'E_TRIE_STORE_MISSING',
    });
  });

  it('routes every trie page and bundle write through the staging scope', async () => {
    const stagePage = vi.fn(async (source: Uint8Array) => (
      await cas.pages.put({ source, maxBytes: 16 * 1024 * 1024 })
    ).handle.toString());
    const stageOrderedBundle = vi.fn(async (members: Iterable<[string, string]>) => {
      const staged = await cas.bundles.putOrdered({ members });
      return new DomainBundleHandle(staged.handle.toString());
    });
    const staging = { stagePage, stageOrderedBundle };

    const leaf = await adapter.writeLeaf(new Uint8Array([1, 2, 3]), staging);
    const branch = await adapter.writeBranch(new Map([[0, leaf]]), staging);

    expect(stagePage).toHaveBeenCalledOnce();
    expect(stageOrderedBundle).toHaveBeenCalledTimes(2);
    expect(cas.readBundleMembers(leaf)[0]).toEqual([
      'leaf/data',
      expect.stringMatching(/^git-cas:1:page:/u),
    ]);
    expect(cas.readBundleMembers(branch)).toEqual([['children/0', leaf]]);
  });

  it('maps an absent bundle to a typed missing-root error', async () => {
    const stored = BundleHandle.parse(
      await adapter.writeLeaf(new Uint8Array([1])),
    );
    const missing = new BundleHandle({
      codec: stored.codec,
      hashAlgorithm: stored.hashAlgorithm,
      oid: 'f'.repeat(stored.oid.length),
    }).toString();

    await expect(adapter.readLeaf(missing)).rejects.toMatchObject({
      code: 'E_TRIE_STORE_MISSING',
    });
    await expect(adapter.readBranch(missing)).rejects.toMatchObject({
      code: 'E_TRIE_STORE_MISSING',
    });
  });

  it('rejects raw OIDs and malformed child roots', async () => {
    await expect(adapter.readBranch('a'.repeat(40))).rejects.toMatchObject({
      code: 'E_TRIE_STORE_CORRUPT',
    });
    await expect(adapter.writeBranch(new Map([[0, 'a'.repeat(40)]])))
      .rejects.toMatchObject({ code: 'E_TRIE_STORE_WRITE' });
  });

  it('rejects branch members that do not reference bundle roots', async () => {
    const leaf = await adapter.writeLeaf(new Uint8Array([1]));
    const branch = await adapter.writeBranch(new Map([[0, leaf]]));
    const page = requireMember(leaf, 'leaf/data');
    cas.replaceBundleMembers(branch, [['children/0', page]]);

    await expect(adapter.readBranch(branch)).rejects.toMatchObject({
      code: 'E_TRIE_STORE_CORRUPT',
    });
  });

  it('rejects leaf members that do not reference pages', async () => {
    const leaf = await adapter.writeLeaf(new Uint8Array([1]));
    cas.replaceBundleMembers(leaf, [['leaf/data', leaf]]);

    await expect(adapter.readLeaf(leaf)).rejects.toMatchObject({
      code: 'E_TRIE_STORE_CORRUPT',
    });
  });

  it('rejects malformed and duplicate branch nibble paths', async () => {
    const leaf = await adapter.writeLeaf(new Uint8Array([1]));
    const branch = await adapter.writeBranch(new Map([[0, leaf]]));

    cas.replaceBundleMembers(branch, [['children/G', leaf]]);
    await expect(adapter.readBranch(branch)).rejects.toMatchObject({
      code: 'E_TRIE_STORE_CORRUPT',
    });

    cas.replaceBundleMembers(branch, [['children/', leaf]]);
    await expect(adapter.readBranch(branch)).rejects.toMatchObject({
      code: 'E_TRIE_STORE_CORRUPT',
    });

    cas.replaceBundleMembers(branch, [['children/0/nested', leaf]]);
    await expect(adapter.readBranch(branch)).rejects.toMatchObject({
      code: 'E_TRIE_STORE_CORRUPT',
    });

    cas.replaceBundleMembers(branch, [
      ['children/0', leaf],
      ['children/00', leaf],
    ]);
    await expect(adapter.readBranch(branch)).rejects.toMatchObject({
      code: 'E_TRIE_STORE_CORRUPT',
    });

    cas.replaceBundleMembers(branch, [[`children/${'f'.repeat(400)}`, leaf]]);
    await expect(adapter.readBranch(branch)).rejects.toMatchObject({
      code: 'E_TRIE_STORE_CORRUPT',
    });
  });

  it('maps git-cas page failures to typed read and write errors', async () => {
    const leaf = await adapter.writeLeaf(new Uint8Array([1]));
    const readFailure = new GitCasTrieStoreAdapter({
      cas: failingPages(cas, 'read'),
    });
    const writeFailure = new GitCasTrieStoreAdapter({
      cas: failingPages(cas, 'write'),
    });

    await expect(readFailure.readLeaf(leaf)).rejects.toMatchObject({
      code: 'E_TRIE_STORE_READ',
    });
    await expect(writeFailure.writeLeaf(new Uint8Array([2])))
      .rejects.toMatchObject({ code: 'E_TRIE_STORE_WRITE' });
  });

  it('maps git-cas branch writes to typed errors and rejects invalid nibbles', async () => {
    const leaf = await adapter.writeLeaf(new Uint8Array([1]));
    const failing = new GitCasTrieStoreAdapter({ cas: failingBundleWrites(cas) });

    await expect(failing.writeBranch(new Map([[0, leaf]]))).rejects.toMatchObject({
      code: 'E_TRIE_STORE_WRITE',
    });
    await expect(adapter.writeBranch(new Map([[-1, leaf]]))).rejects.toMatchObject({
      code: 'E_TRIE_STORE_WRITE',
    });
  });

  it('requires a git-cas dependency at runtime', () => {
    expect(() => Reflect.construct(GitCasTrieStoreAdapter, [null]))
      .toThrow(expect.objectContaining({ code: 'E_TRIE_STORE_WRITE' }));
  });

  function requireMember(root: string, path: string): string {
    const member = cas.readBundleMembers(root).find(([candidate]) => candidate === path);
    if (member === undefined) {
      throw new Error(`Missing test bundle member ${path}`);
    }
    return member[1];
  }
});

function failingPages(
  cas: InMemoryGitCasFacade,
  operation: 'read' | 'write',
): GitCasTrieFacade {
  return {
    bundles: cas.bundles,
    pages: {
      get: operation === 'read'
        ? async () => { throw new Error('page read unavailable'); }
        : cas.pages.get,
      put: operation === 'write'
        ? async () => { throw new Error('page write unavailable'); }
        : cas.pages.put,
    },
  };
}

function failingBundleWrites(cas: InMemoryGitCasFacade): GitCasTrieFacade {
  return {
    bundles: {
      getMemberReference: cas.bundles.getMemberReference,
      iterateMemberReferences: cas.bundles.iterateMemberReferences,
      putOrdered: async () => { throw new Error('bundle write unavailable'); },
    },
    pages: cas.pages,
  };
}
