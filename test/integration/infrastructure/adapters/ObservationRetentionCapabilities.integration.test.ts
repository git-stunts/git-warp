import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ContentAddressableStore, { type AssetHandle } from '@git-stunts/git-cas';
import Plumbing from '@git-stunts/plumbing';
import { afterEach, describe, expect, it } from 'vitest';

// Dependency capability witnesses for #1066, not a public Coordinate implementation.
const WRITER_COUNT = 129;
const MAX_PARENTS = 64;
const WRITER_BATCH = MAX_PARENTS - 1;
const OBSERVATION_REF = 'refs/warp/retention-fixture/observation';
const directories: string[] = [];
const stores = new Set<ContentAddressableStore>();

afterEach(async () => {
  const closed = await Promise.allSettled([...stores].map(async (store) => await store.close()));
  stores.clear();
  await Promise.all(directories.splice(0).map(async (path) => await rm(path, { recursive: true })));
  expect(closed.every((result) => result.status === 'fulfilled')).toBe(true);
});

function git(path: string, args: string[]): string {
  return execFileSync('git', args, { cwd: path, encoding: 'utf8' }).trim();
}

async function openStore(path: string): Promise<ContentAddressableStore> {
  const plumbing = await Plumbing.createDefault({ cwd: path });
  const store = ContentAddressableStore.createCbor({
    plumbing,
    applicationRefPrefixes: ['refs/warp/retention-fixture/'],
    clock: { now: () => new Date('2026-11-02T00:00:00.000Z') },
  });
  stores.add(store);
  return store;
}

async function closeStore(store: ContentAddressableStore): Promise<void> {
  await store.close();
  stores.delete(store);
}

async function repository(format: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'warp-observation-retention-'));
  directories.push(path);
  git(path, ['init', '--bare', '--quiet', `--object-format=${format}`]);
  expect(git(path, ['rev-parse', '--show-object-format'])).toBe(format);
  git(path, ['config', 'user.name', 'Retention fixture']);
  git(path, ['config', 'user.email', 'retention@example.invalid']);
  git(path, ['config', 'gc.auto', '0']);
  return path;
}

async function* bytes(value: string): AsyncGenerator<Uint8Array> {
  yield new TextEncoder().encode(value);
}

async function asset(store: ContentAddressableStore, value: string): Promise<AssetHandle> {
  return (await store.assets.put({ source: bytes(value), slug: 'evidence', filename: 'evidence.txt' })).handle;
}

async function readBytes(store: ContentAddressableStore, handle: string): Promise<Uint8Array> {
  const result: number[] = [];
  for await (const chunk of store.assets.open({ handle })) {
    result.push(...chunk);
    expect(result.length).toBeLessThan(1024);
  }
  return new Uint8Array(result);
}

function writerRef(index: number): string {
  return `refs/warp/retention-fixture/writers/w${index}`;
}

async function* writerHeads(
  store: ContentAddressableStore, root: AssetHandle, oracle: string[],
): AsyncGenerator<string> {
  for (let index = 0; index < WRITER_COUNT; index++) {
    const result = await store.publications.commit({
      root, commit: { message: `writer fixture ${index}`, parents: [] },
      ref: { name: writerRef(index), expected: null },
    });
    oracle.push(result.commitId);
    yield result.commitId;
  }
}

/** Test recipe: bounded parent batches through the published CAS API only. */
async function retainHistory(
  store: ContentAddressableStore, root: AssetHandle, heads: AsyncIterable<string>,
): Promise<string[]> {
  const publications: string[] = [];
  let previous: string | null = null;
  let batch: string[] = [];
  async function publish(): Promise<void> {
    const parents = previous === null ? batch : [previous, ...batch];
    expect(parents.length).toBeLessThanOrEqual(MAX_PARENTS);
    const result = await store.publications.commit({
      root, commit: { message: 'retention carrier fixture', parents },
      ref: { name: OBSERVATION_REF, expected: previous },
    });
    previous = result.commitId;
    publications.push(previous);
    batch = [];
  }
  for await (const head of heads) {
    batch.push(head);
    if (batch.length === WRITER_BATCH) { await publish(); }
  }
  if (batch.length > 0) { await publish(); }
  return publications;
}

function collectGarbage(path: string): void {
  git(path, ['reflog', 'expire', '--expire=now', '--all']);
  git(path, ['gc', '--prune=now', '--quiet']);
}

describe.each(['sha1', 'sha256'])('observation retention dependency capabilities (%s)', (format) => {
  it('retains 129 history heads and original evidence through CAS publications, restart and GC', async () => {
    const path = await repository(format);
    const first = await openStore(path);
    const evidence = 'original observation evidence fixture';
    const root = await asset(first, evidence);
    const handle = root.toString();
    const heads: string[] = [];
    const publications = await retainHistory(first, root, writerHeads(first, root, heads));
    expect(heads).toHaveLength(WRITER_COUNT);
    expect(publications).toHaveLength(3);
    expect(publications.map((oid) => git(path, ['rev-list', '--parents', '-n', '1', oid]).split(/\s+/).length - 1))
      .toEqual([63, 64, 4]);
    await expect(first.publications.commit({
      root, commit: { message: 'oversized control', parents: heads.slice(0, 65) },
      ref: { name: OBSERVATION_REF, expected: publications.at(-1) ?? null },
    })).rejects.toMatchObject({ code: 'PUBLICATION_INVALID' });
    expect(git(path, ['rev-parse', OBSERVATION_REF])).toBe(publications.at(-1));
    for (const [index, head] of heads.entries()) {
      git(path, ['update-ref', '-d', writerRef(index), head]);
    }
    await closeStore(first);
    expect(git(path, ['for-each-ref', '--format=%(refname)'])).toBe(OBSERVATION_REF);
    collectGarbage(path);
    const reopened = await openStore(path);
    expect(await readBytes(reopened, handle)).toEqual(new TextEncoder().encode(evidence));
    for (const head of heads) { expect(git(path, ['cat-file', '-t', head])).toBe('commit'); }
  });

  it('does not mistake an OID in retained metadata for a history reachability edge', async () => {
    const path = await repository(format);
    const first = await openStore(path);
    const source = await asset(first, 'source history fixture');
    const history = await first.publications.commit({
      root: source, commit: { message: 'metadata-only history', parents: [] },
      ref: { name: writerRef(0), expected: null },
    });
    const text = `history=${history.commitId}`;
    expect(git(path, ['cat-file', '-t', history.commitId])).toBe('commit');
    const metadata = await asset(first, text);
    await first.retention.retain({
      handle: metadata,
      root: { ref: 'refs/cas/rootsets/observation-fixture', name: 'metadata' },
      policy: 'pinned',
    });
    git(path, ['update-ref', '-d', writerRef(0), history.commitId]);
    await closeStore(first);
    collectGarbage(path);
    const reopened = await openStore(path);
    expect(await readBytes(reopened, metadata.toString())).toEqual(new TextEncoder().encode(text));
    const missing = spawnSync('git', ['cat-file', '-e', history.commitId], { cwd: path, encoding: 'utf8' });
    expect(missing.error).toBeUndefined();
    expect(missing.status).toBe(1);
  });

  it('reports pinned-cache over-capacity without providing a hard reservation refusal', async () => {
    const path = await repository(format);
    const first = await openStore(path);
    const cache = await first.caches.open({ namespace: 'observation-fixture', policy: { maxEntries: 1 } });
    const one = await asset(first, 'one');
    const two = await asset(first, 'two');
    await cache.put('one', one, { retention: 'pinned' });
    const admitted = await cache.put('two', two, { retention: 'pinned' });
    expect(admitted.accepted).toBe(true);
    expect(admitted.policy).toMatchObject({ satisfied: false, entryCount: 2, pinnedEntries: 2 });
    await closeStore(first);
    collectGarbage(path);
    const reopened = await openStore(path);
    const persisted = await reopened.caches.open({ namespace: 'observation-fixture' });
    expect((await persisted.get('one'))?.handle.toString()).toBe(one.toString());
    expect((await persisted.get('two'))?.handle.toString()).toBe(two.toString());
    expect((await persisted.inspect()).policy).toMatchObject({ satisfied: false, entryCount: 2 });
  });
});
