/**
 * Integration tests for GitTrieStoreAdapter against a real Git repo.
 *
 * Spins up a temp directory, `git init`s it, and drives the adapter
 * through the real `@git-stunts/plumbing` runtime. Validates that
 * written leaves are recognisable as Git blobs by `git cat-file blob`
 * and that written branches are recognisable as Git trees by
 * `git ls-tree`.
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Plumbing from '@git-stunts/plumbing';

import GitTrieStoreAdapter from '../../../../src/infrastructure/adapters/GitTrieStoreAdapter.ts';
import TrieStoreError from '../../../../src/domain/errors/TrieStoreError.ts';
import type { TrieBranchEntries } from '../../../../src/domain/orset/trie/TrieBranchEntries.ts';

interface PlumbingRuntime {
  execute(opts: { args: string[]; input?: string | Buffer }): Promise<string>;
}

interface HarnessContext {
  readonly tempDir: string;
  readonly plumbing: PlumbingRuntime;
  readonly adapter: GitTrieStoreAdapter;
  cleanup(): Promise<void>;
}

async function createHarness(): Promise<HarnessContext> {
  const tempDir = await mkdtemp(join(tmpdir(), 'warp-trie-store-adapter-'));
  try {
    const plumbing = await Plumbing.createDefault({ cwd: tempDir });
    await plumbing.execute({ args: ['init', '-q'] });
    await plumbing.execute({ args: ['config', 'user.email', 'test@test.com'] });
    await plumbing.execute({ args: ['config', 'user.name', 'Test'] });
    const adapter = new GitTrieStoreAdapter({ plumbing });
    return {
      tempDir,
      plumbing,
      adapter,
      async cleanup(): Promise<void> {
        await rm(tempDir, { recursive: true, force: true });
      },
    };
  } catch (err) {
    await rm(tempDir, { recursive: true, force: true });
    throw err;
  }
}

describe('GitTrieStoreAdapter integration', () => {
  let harness: HarnessContext;

  beforeEach(async () => {
    harness = await createHarness();
  });

  afterEach(async () => {
    await harness.cleanup();
  });

  describe('writeLeaf produces real Git blobs', () => {
    it('yields a blob recognisable by `git cat-file -t` and `git cat-file blob`', async () => {
      const bytes = new TextEncoder().encode('leaf-payload');
      const oid = await harness.adapter.writeLeaf(bytes);

      const type = await harness.plumbing.execute({
        args: ['cat-file', '-t', oid],
      });
      expect(type.trim()).toBe('blob');

      const contents = await harness.plumbing.execute({
        args: ['cat-file', 'blob', oid],
      });
      expect(contents).toBe('leaf-payload');
    });

    it('returns the same bytes when reading back through the adapter', async () => {
      const bytes = new Uint8Array([0, 1, 2, 3, 255, 128]);
      const oid = await harness.adapter.writeLeaf(bytes);
      const read = await harness.adapter.readLeaf(oid);
      expect(Array.from(read)).toEqual(Array.from(bytes));
    });

    it('produces a stable OID — repeated writes of the same bytes return the same OID', async () => {
      const bytes = new TextEncoder().encode('deterministic');
      const oid1 = await harness.adapter.writeLeaf(bytes);
      const oid2 = await harness.adapter.writeLeaf(bytes);
      expect(oid1).toBe(oid2);
    });
  });

  describe('writeBranch produces real Git trees', () => {
    it('yields a tree recognisable by `git cat-file -t` and `git ls-tree`', async () => {
      const leafA = await harness.adapter.writeLeaf(new TextEncoder().encode('a'));
      const leafB = await harness.adapter.writeLeaf(new TextEncoder().encode('b'));
      const children: TrieBranchEntries = new Map<number, string>([
        [0, leafA],
        [15, leafB],
      ]);
      const treeOid = await harness.adapter.writeBranch(children);

      const type = await harness.plumbing.execute({
        args: ['cat-file', '-t', treeOid],
      });
      expect(type.trim()).toBe('tree');

      const listing = await harness.plumbing.execute({
        args: ['ls-tree', treeOid],
      });
      expect(listing).toMatch(/100644 blob [0-9a-f]{40}\t0(\n|$)/);
      expect(listing).toMatch(/100644 blob [0-9a-f]{40}\tf(\n|$)/);
    });

    it('round-trips a 16-way sparse branch through the adapter', async () => {
      const oids: Record<number, string> = {};
      const children = new Map<number, string>();
      for (const nibble of [0, 3, 7, 11, 15]) {
        const oid = await harness.adapter.writeLeaf(new Uint8Array([nibble]));
        oids[nibble] = oid;
        children.set(nibble, oid);
      }
      const treeOid = await harness.adapter.writeBranch(children);
      const read = await harness.adapter.readBranch(treeOid);
      expect(read.size).toBe(5);
      for (const nibble of [0, 3, 7, 11, 15]) {
        expect(read.get(nibble)).toBe(oids[nibble]);
      }
    });

    it('round-trips a wide 256-way branch through the adapter', async () => {
      const children = new Map<number, string>();
      for (let i = 0; i < 256; i += 1) {
        const oid = await harness.adapter.writeLeaf(
          new Uint8Array([i & 0xff, (i >> 8) & 0xff]),
        );
        children.set(i, oid);
      }
      const treeOid = await harness.adapter.writeBranch(children);
      const read = await harness.adapter.readBranch(treeOid);
      expect(read.size).toBe(256);
      expect(read.get(0)).toBe(children.get(0));
      expect(read.get(128)).toBe(children.get(128));
      expect(read.get(255)).toBe(children.get(255));
    });

    it('branch-of-branches-of-leaves forms a valid Git tree hierarchy', async () => {
      // Build a two-level tree:
      //   rootTree -> [ 0 => innerTree, 1 => leafOuter ]
      //   innerTree -> [ 2 => leafInnerA, 3 => leafInnerB ]
      const leafInnerA = await harness.adapter.writeLeaf(new TextEncoder().encode('inner-a'));
      const leafInnerB = await harness.adapter.writeLeaf(new TextEncoder().encode('inner-b'));
      const innerTree = await harness.adapter.writeBranch(
        new Map<number, string>([
          [2, leafInnerA],
          [3, leafInnerB],
        ]),
      );
      const leafOuter = await harness.adapter.writeLeaf(new TextEncoder().encode('outer'));
      const rootTree = await harness.adapter.writeBranch(
        new Map<number, string>([
          [0, innerTree],
          [1, leafOuter],
        ]),
      );

      // Root level: has one tree entry (0) and one blob entry (1).
      const rootListing = await harness.plumbing.execute({
        args: ['ls-tree', rootTree],
      });
      expect(rootListing).toMatch(/040000 tree [0-9a-f]{40}\t0(\n|$)/);
      expect(rootListing).toMatch(/100644 blob [0-9a-f]{40}\t1(\n|$)/);

      // Inner level: two blob entries (2 and 3).
      const innerListing = await harness.plumbing.execute({
        args: ['ls-tree', innerTree],
      });
      expect(innerListing).toMatch(/100644 blob [0-9a-f]{40}\t2(\n|$)/);
      expect(innerListing).toMatch(/100644 blob [0-9a-f]{40}\t3(\n|$)/);

      // Adapter can walk the hierarchy end-to-end.
      const readRoot = await harness.adapter.readBranch(rootTree);
      expect(readRoot.get(0)).toBe(innerTree);
      expect(readRoot.get(1)).toBe(leafOuter);
      const readInner = await harness.adapter.readBranch(
        readRoot.get(0) ?? 'missing',
      );
      expect(readInner.get(2)).toBe(leafInnerA);
      expect(readInner.get(3)).toBe(leafInnerB);

      // git cat-file -p on the root walks the tree naturally.
      const rootPretty = await harness.plumbing.execute({
        args: ['cat-file', '-p', rootTree],
      });
      expect(rootPretty).toMatch(/040000 tree [0-9a-f]{40}\t0(\n|$)/);
      expect(rootPretty).toMatch(/100644 blob [0-9a-f]{40}\t1(\n|$)/);
    });

    it('raises E_TRIE_STORE_MISSING when readBranch is asked for a nonexistent OID', async () => {
      try {
        await harness.adapter.readBranch(
          '0000000000000000000000000000000000000000',
        );
        throw new Error('expected TrieStoreError');
      } catch (err) {
        expect(err).toBeInstanceOf(TrieStoreError);
        if (err instanceof TrieStoreError) {
          expect(err.code).toBe('E_TRIE_STORE_MISSING');
        }
      }
    });

    it('raises E_TRIE_STORE_MISSING when readLeaf is asked for a nonexistent OID', async () => {
      try {
        await harness.adapter.readLeaf(
          '0000000000000000000000000000000000000000',
        );
        throw new Error('expected TrieStoreError');
      } catch (err) {
        expect(err).toBeInstanceOf(TrieStoreError);
        if (err instanceof TrieStoreError) {
          expect(err.code).toBe('E_TRIE_STORE_MISSING');
        }
      }
    });
  });
});
