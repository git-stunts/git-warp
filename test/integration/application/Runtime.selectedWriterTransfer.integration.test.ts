import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { Runtime } from '../../../index.ts';
import Intent from '../../../src/domain/api/Intent.ts';
import { createTestRepo } from '../api/helpers/setup.ts';

/**
 * Regression witness for #975. Runs the exact publish and receive commands
 * published in docs/topics/sync.md against a bare hub and disposable clones.
 */
const LANE = 'team';
const SYNC_DOC = fileURLToPath(new URL('../../../docs/topics/sync.md', import.meta.url));
const CASE_TIMEOUT_MS = 120_000;
const PRUNE_MODES = ['none', 'local fetch.prune', 'global fetch.prune', 'remote prune'] as const;
type PruneMode = typeof PRUNE_MODES[number];
const writerRef = (writer: string): string => `refs/warp/${LANE}/writers/${writer}`;
const CHECKPOINT_REF = `refs/warp/${LANE}/checkpoints/head`;
const MARKER_REF = `refs/warp/${LANE}/substrate-version`;
type Clone = Awaited<ReturnType<typeof createTestRepo>>;

interface Recipes { publish: string; receive: string }
interface Outcome { status: number | null; output: string }

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) { await cleanup(); }
});

/** Returns the bash block that follows a heading on the sync page, verbatim. */
function blockAfter(page: string, heading: string): string {
  const start = page.indexOf(`\n## ${heading}\n`);
  const block = start < 0 ? null : /```bash\n([\s\S]*?)```/u.exec(page.slice(start));
  if (block === null || block[1] === undefined) { throw new Error(`sync.md has no bash block under "${heading}"`); }
  return block[1];
}

async function documentedRecipes(): Promise<Recipes> {
  const page = await readFile(SYNC_DOC, 'utf8');
  return {
    publish: blockAfter(page, 'Publish this writer'),
    receive: blockAfter(page, 'Receive other writers'),
  };
}

function git(cwd: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim();
}

function refs(cwd: string): Map<string, string> {
  const listing = git(cwd, ['for-each-ref', '--format=%(refname) %(objectname)']);
  return new Map(listing.split('\n').filter(Boolean).map(line => {
    const [name = '', oid = ''] = line.split(' ');
    return [name, oid];
  }));
}

async function hub(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'warp-transfer-hub-'));
  cleanups.push(async () => { await rm(directory, { recursive: true, force: true }); });
  git(directory, ['init', '--bare', '--quiet']);
  return directory;
}

async function clone(label: string, hubPath: string, mode: PruneMode): Promise<Clone & { env: typeof process.env }> {
  const repository = await createTestRepo(label);
  cleanups.push(async () => { await repository.cleanup(); });
  git(repository.tempDir, ['remote', 'add', 'origin', hubPath]);
  if (mode === 'local fetch.prune') { git(repository.tempDir, ['config', 'fetch.prune', 'true']); }
  if (mode === 'remote prune') { git(repository.tempDir, ['config', 'remote.origin.prune', 'true']); }
  const globalConfig = join(repository.tempDir, '.git', 'transfer-global.gitconfig');
  await writeFile(globalConfig, mode === 'global fetch.prune' ? '[fetch]\n\tprune = true\n' : '');
  return Object.assign(repository, { env: { ...process.env, GIT_CONFIG_GLOBAL: globalConfig } });
}

function run(target: Clone & { env: typeof process.env }, script: string, writer: string): Outcome {
  const result = spawnSync('sh', ['-c', script], {
    cwd: target.tempDir,
    env: { ...target.env, LANE, WRITER: writer },
    encoding: 'utf8',
    timeout: 60_000,
  });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

/** Gives the hub an incompatible substrate marker, as an older or foreign hub would hold. */
function plantForeignMarker(hubPath: string): string {
  const blob = execFileSync('git', ['-C', hubPath, 'hash-object', '-w', '--stdin'], {
    input: 'git-warp-retained-substrate\nversion: 18\n', encoding: 'utf8',
  }).trim();
  git(hubPath, ['update-ref', MARKER_REF, blob]);
  return blob;
}

async function write(target: Clone, writer: string, subject: string): Promise<void> {
  const runtime = await Runtime.open({ at: target.tempDir, writer });
  try {
    await (await runtime.lane(LANE)).write(Intent.addEntity({ subject, properties: { by: writer } }));
  } finally {
    await runtime.close();
  }
}

async function nodes(target: Clone): Promise<string[]> {
  const graph = await target.openGraph(LANE, 'transfer-reader');
  await graph.materialize();
  return (await graph.getNodes()).sort();
}

async function checkpoint(target: Clone, writer: string): Promise<void> {
  const graph = await target.openGraph(LANE, writer);
  await graph.materialize();
  await graph.createCheckpoint();
}

describe.each(PRUNE_MODES)('documented selected-writer transfer (%s)', (mode) => {
  it('exchanges edits while every unpublished local chain stays unchanged', async () => {
    const recipes = await documentedRecipes();
    const hubPath = await hub();
    const alice = await clone('transfer-alice', hubPath, mode);
    const bob = await clone('transfer-bob', hubPath, mode);

    await write(alice, 'alice', 'from-alice');
    expect(run(alice, recipes.publish, 'alice')).toMatchObject({ status: 0 });
    await write(bob, 'bob', 'from-bob');
    git(bob.tempDir, ['pack-refs', '--all']);
    git(bob.tempDir, ['gc', '--quiet']);
    const bobUnpublished = refs(bob.tempDir).get(writerRef('bob'));

    const received = run(bob, recipes.receive, 'bob');
    expect(received, received.output).toMatchObject({ status: 0 });
    expect(refs(bob.tempDir).get(writerRef('bob'))).toBe(bobUnpublished);
    expect(refs(bob.tempDir).get(writerRef('alice'))).toBe(refs(hubPath).get(writerRef('alice')));
    expect(await nodes(bob)).toEqual(['from-alice', 'from-bob']);
    expect(refs(bob.tempDir).has(CHECKPOINT_REF)).toBe(true);

    expect(run(bob, recipes.publish, 'bob')).toMatchObject({ status: 0 });
    await write(alice, 'alice', 'alice-unpublished');
    const aliceUnpublished = refs(alice.tempDir).get(writerRef('alice'));
    expect(run(alice, recipes.receive, 'alice')).toMatchObject({ status: 0 });
    expect(refs(alice.tempDir).get(writerRef('alice'))).toBe(aliceUnpublished);
    expect(await nodes(alice)).toEqual(['alice-unpublished', 'from-alice', 'from-bob']);
  }, CASE_TIMEOUT_MS);

  it('publishes only the local writer chain and the lane marker', async () => {
    const recipes = await documentedRecipes();
    const hubPath = await hub();
    const alice = await clone('transfer-owner-alice', hubPath, mode);
    const bob = await clone('transfer-owner-bob', hubPath, mode);
    await write(alice, 'alice', 'a');
    expect(run(alice, recipes.publish, 'alice')).toMatchObject({ status: 0 });
    await write(bob, 'bob', 'b');
    expect(run(bob, recipes.receive, 'bob')).toMatchObject({ status: 0 });
    await checkpoint(bob, 'bob');

    expect(run(bob, recipes.publish, 'bob')).toMatchObject({ status: 0 });

    expect([...refs(hubPath).keys()].sort()).toEqual([MARKER_REF, writerRef('alice'), writerRef('bob')].sort());
  }, CASE_TIMEOUT_MS);
});

describe('documented selected-writer transfer refusals', () => {
  it('keeps a newer local chain when the hub is stale', async () => {
    const recipes = await documentedRecipes();
    const hubPath = await hub();
    const alice = await clone('stale-alice', hubPath, 'local fetch.prune');
    const bob = await clone('stale-bob', hubPath, 'local fetch.prune');
    await write(alice, 'alice', 'old');
    expect(run(alice, recipes.publish, 'alice')).toMatchObject({ status: 0 });
    await write(alice, 'alice', 'new');
    git(bob.tempDir, ['fetch', '--no-tags', alice.tempDir, `${writerRef('alice')}:${writerRef('alice')}`, `${MARKER_REF}:${MARKER_REF}`]);
    const newer = refs(bob.tempDir).get(writerRef('alice'));

    const refused = run(bob, recipes.receive, 'bob');

    expect(refused.status).not.toBe(0);
    expect(refused.output).toMatch(/rejected|non-fast-forward/u);
    expect(refs(bob.tempDir).get(writerRef('alice'))).toBe(newer);
  }, CASE_TIMEOUT_MS);

  it('refuses a conflicting writer identity without moving the hub', async () => {
    const recipes = await documentedRecipes();
    const hubPath = await hub();
    const first = await clone('collision-first', hubPath, 'none');
    const second = await clone('collision-second', hubPath, 'none');
    await write(first, 'alice', 'first');
    expect(run(first, recipes.publish, 'alice')).toMatchObject({ status: 0 });
    const published = refs(hubPath).get(writerRef('alice'));
    await write(second, 'alice', 'second');

    const refused = run(second, recipes.publish, 'alice');

    expect(refused.status).not.toBe(0);
    expect(refused.output).toMatch(/rejected|non-fast-forward|fetch first/u);
    expect(refs(hubPath).get(writerRef('alice'))).toBe(published);
  }, CASE_TIMEOUT_MS);

  it('leaves the receiver checkpoint head alone when the hub carries a foreign one', async () => {
    const recipes = await documentedRecipes();
    const hubPath = await hub();
    const alice = await clone('checkpoint-alice', hubPath, 'none');
    const bob = await clone('checkpoint-bob', hubPath, 'none');
    await write(alice, 'alice', 'a');
    await checkpoint(alice, 'alice');
    expect(run(alice, recipes.publish, 'alice')).toMatchObject({ status: 0 });
    git(alice.tempDir, ['push', 'origin', `${CHECKPOINT_REF}:${CHECKPOINT_REF}`]);
    await write(bob, 'bob', 'b');
    await checkpoint(bob, 'bob');
    const bobCheckpoint = refs(bob.tempDir).get(CHECKPOINT_REF);

    const received = run(bob, recipes.receive, 'bob');

    expect(received, received.output).toMatchObject({ status: 0 });
    expect(refs(bob.tempDir).get(CHECKPOINT_REF)).not.toBe(refs(hubPath).get(CHECKPOINT_REF));
    expect(await nodes(bob)).toEqual(['a', 'b']);
    expect(refs(bob.tempDir).get(CHECKPOINT_REF)).not.toBe(bobCheckpoint);
  }, CASE_TIMEOUT_MS);

  it('gives a fresh receiver the marker, chains, and a local checkpoint', async () => {
    const recipes = await documentedRecipes();
    const hubPath = await hub();
    const alice = await clone('fresh-alice', hubPath, 'global fetch.prune');
    const fresh = await clone('fresh-receiver', hubPath, 'global fetch.prune');
    await write(alice, 'alice', 'a');
    expect(run(alice, recipes.publish, 'alice')).toMatchObject({ status: 0 });

    const received = run(fresh, recipes.receive, 'carol');

    expect(received, received.output).toMatchObject({ status: 0 });
    expect(refs(fresh.tempDir).get(MARKER_REF)).toBe(refs(hubPath).get(MARKER_REF));
    expect(refs(fresh.tempDir).has(CHECKPOINT_REF)).toBe(true);
    expect(await nodes(fresh)).toEqual(['a']);
  }, CASE_TIMEOUT_MS);

  it('publishes nothing to a hub whose substrate marker differs', async () => {
    const recipes = await documentedRecipes();
    const hubPath = await hub();
    const alice = await clone('foreign-marker-alice', hubPath, 'none');
    const foreign = plantForeignMarker(hubPath);
    await write(alice, 'alice', 'a');

    const refused = run(alice, recipes.publish, 'alice');

    expect(refused.status).not.toBe(0);
    expect(refs(hubPath).has(writerRef('alice'))).toBe(false);
    expect(refs(hubPath).get(MARKER_REF)).toBe(foreign);
  }, CASE_TIMEOUT_MS);

  it('receives nothing from a hub whose substrate marker differs', async () => {
    const recipes = await documentedRecipes();
    const hubPath = await hub();
    const alice = await clone('foreign-receive-alice', hubPath, 'none');
    const bob = await clone('foreign-receive-bob', hubPath, 'none');
    await write(alice, 'alice', 'a');
    git(alice.tempDir, ['push', 'origin', `${writerRef('alice')}:${writerRef('alice')}`]);
    plantForeignMarker(hubPath);
    await write(bob, 'bob', 'b');
    const bobMarker = refs(bob.tempDir).get(MARKER_REF);

    const refused = run(bob, recipes.receive, 'bob');

    expect(refused.status).not.toBe(0);
    expect(refs(bob.tempDir).has(writerRef('alice'))).toBe(false);
    expect(refs(bob.tempDir).get(MARKER_REF)).toBe(bobMarker);
  }, CASE_TIMEOUT_MS);

  it('refuses an older hub without a substrate marker and changes nothing', async () => {
    const recipes = await documentedRecipes();
    const hubPath = await hub();
    const alice = await clone('markerless-alice', hubPath, 'none');
    const fresh = await clone('markerless-receiver', hubPath, 'none');
    await write(alice, 'alice', 'a');
    git(alice.tempDir, ['push', 'origin', `${writerRef('alice')}:${writerRef('alice')}`]);

    const refused = run(fresh, recipes.receive, 'carol');

    expect(refused.status).not.toBe(0);
    expect([...refs(fresh.tempDir).keys()].filter(name => name.startsWith('refs/warp/'))).toEqual([]);
  }, CASE_TIMEOUT_MS);

  it('names the missing marker, not a v18 migration, when current chains arrive without it', async () => {
    const hubPath = await hub();
    const alice = await clone('unmarked-alice', hubPath, 'none');
    const fresh = await clone('unmarked-receiver', hubPath, 'none');
    await write(alice, 'alice', 'a');
    git(alice.tempDir, ['push', 'origin', `${writerRef('alice')}:${writerRef('alice')}`]);
    git(fresh.tempDir, ['fetch', '--no-tags', 'origin', `${writerRef('alice')}:${writerRef('alice')}`]);

    const runtime = await Runtime.open({ at: fresh.tempDir, writer: 'carol' });
    try {
      await expect(runtime.lane(LANE)).rejects.toMatchObject({
        code: 'E_SUBSTRATE_MARKER_MISSING',
        message: expect.stringContaining(MARKER_REF),
      });
    } finally {
      await runtime.close();
    }
    expect(refs(fresh.tempDir).has(MARKER_REF)).toBe(false);
  }, CASE_TIMEOUT_MS);
});
