import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { intent } from '../../../advanced.ts';
import GitTimelineHistoryAdapter from '../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import RepositoryObjectCensus from '../../helpers/RepositoryObjectCensus.ts';
import { disposeWarpFixtures, git, GRAPH, open, repository, retained, tip, unpublished } from '../../helpers/WarpWriteFixture.ts';

/**
 * #1127 witnesses. A cone head rebuilt over old garbage names a tree that
 * `git fast-import` found in a cruft pack and did not refresh (#1110). Each
 * test runs a real `git gc` at one fixed point of the next write: in place of
 * the write's first cone-head update. No step reads the wall clock: old
 * garbage gets a stamped age and every prune date is absolute.
 */
const OLD_SECONDS = 946_684_800; // 2000-01-01T00:00:00Z, the age stamped on old garbage
const KEEP = '1999-01-01 00:00:00 +0000'; // older than the stamp: the garbage stays, in a cruft pack
const DROP = '2000-06-01 00:00:00 +0000'; // newer than the stamp: garbage that nothing recent reaches goes
const CONE_HEAD = `refs/warp/${GRAPH}/cone/head`;
const SEED_WRITES = 3;
const CASE_TIMEOUT_MS = 120_000;

/** The tree a cone-head update named, and whether only a pack held it then: fast-import reused old garbage. */
type ConeHeadUpdate = { readonly tree: string; readonly packedOnly: boolean };
/** What the overlapped update did inside the GC: its exit status, or `not run`, and its diagnostics. */
type OverlappedUpdate = { readonly status: string; readonly stderr: string };

const scratch: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await disposeWarpFixtures();
  await Promise.all(scratch.splice(0).map(async (path) => await rm(path, { recursive: true, force: true })));
});

/**
 * A repository after SEED_WRITES writes whose cone head was deleted, the
 * documented recovery for `E_CONE_LAYOUT_UNSUPPORTED`. Its garbage, the last
 * published cone tree included, is old and only in a cruft pack.
 */
async function oldGarbageWithoutConeHead(): Promise<string> {
  const path = await repository();
  git(path, ['config', 'gc.auto', '0']);
  git(path, ['config', 'maintenance.auto', 'false']);
  git(path, ['config', 'core.logAllRefUpdates', 'false']);
  const seeding = await open(path);
  for (let index = 1; index <= SEED_WRITES; index += 1) {
    retained(await seeding.as('alice').execute(intent.node.add({ subject: `node:${index}` })));
  }
  await seeding.close();
  git(path, ['update-ref', '-d', CONE_HEAD]);
  new RepositoryObjectCensus(path).stampLoose(OLD_SECONDS);
  git(path, ['gc', '--cruft', `--prune=${KEEP}`, '--quiet']);
  return path;
}

/**
 * Runs `around` in place of the first cone-head update made after this call;
 * `update` makes that update, and `args` are its `git update-ref` arguments.
 * Later updates run unchanged. Returns the updates `around` replaced.
 */
function aroundFirstConeHeadUpdate(
  path: string,
  around: (update: () => Promise<void>, args: readonly string[]) => Promise<void>,
): ConeHeadUpdate[] {
  const census = new RepositoryObjectCensus(path);
  const compareAndSwapRef = GitTimelineHistoryAdapter.prototype.compareAndSwapRef;
  const replaced: ConeHeadUpdate[] = [];
  vi.spyOn(GitTimelineHistoryAdapter.prototype, 'compareAndSwapRef').mockImplementation(async function firstConeHeadUpdate(
    this: GitTimelineHistoryAdapter,
    ref: string,
    tree: string,
    expected: string | null,
  ) {
    if (ref !== CONE_HEAD || replaced.length > 0) {
      await compareAndSwapRef.call(this, ref, tree, expected);
      return;
    }
    replaced.push({ tree, packedOnly: !census.loose().has(tree) });
    await around(async () => { await compareAndSwapRef.call(this, ref, tree, expected); }, ['update-ref', ref, tree, expected ?? '']);
  });
  return replaced;
}

function gc(path: string, args: readonly string[]): void {
  execFileSync('git', ['gc', ...args, '--quiet'], { cwd: path });
}

/**
 * Runs `git gc --cruft --prune=DROP` and makes the ref update `update` inside
 * it: after repack read the refs for its reachable pass, before its cruft pass
 * chose what to keep. A `git` wrapper placed first in GIT_EXEC_PATH runs the
 * update when repack starts `pack-objects --cruft` (Git 2.37 and later).
 */
async function gcOverlapping(path: string, update: readonly string[]): Promise<OverlappedUpdate> {
  const shim = await mkdtemp(join(tmpdir(), 'cone-gc-shim-'));
  scratch.push(shim);
  const realGit = execFileSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).trim();
  const realExecPath = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim();
  const pending = join(shim, 'pending');
  const status = join(shim, 'status');
  const stderr = join(shim, 'stderr');
  writeFileSync(pending, `${update.join('\n')}\n`);
  writeFileSync(join(shim, 'git'), [
    '#!/usr/bin/env bash',
    `if [[ " $* " == *" pack-objects "* && " $* " == *" --cruft "* && ! -e '${status}' ]]; then`,
    `  mapfile -t update < '${pending}'`,
    `  GIT_EXEC_PATH='${realExecPath}' '${realGit}' "\${update[@]}" 2>'${stderr}'`,
    `  echo "$?" >'${status}'`,
    'fi',
    `exec env GIT_EXEC_PATH='${shim}' '${realGit}' "$@"`,
    '',
  ].join('\n'));
  chmodSync(join(shim, 'git'), 0o755);
  execFileSync(realGit, ['gc', '--cruft', `--prune=${DROP}`, '--quiet'], { cwd: path, env: { ...process.env, GIT_EXEC_PATH: shim } });
  return {
    status: existsSync(status) ? readFileSync(status, 'utf8').trim() : 'not run',
    stderr: existsSync(stderr) ? readFileSync(stderr, 'utf8').trim() : '',
  };
}

/** `git fsck --connectivity-only`: its exit status, and its output for the failure message. */
function connectivity(path: string): { readonly status: number | null; readonly output: string } {
  const run = spawnSync('git', ['fsck', '--connectivity-only', '--no-dangling', '--no-progress'], { cwd: path, encoding: 'utf8' });
  return { status: run.status, output: `${run.stdout}${run.stderr}`.trim() };
}

/** The exit status of the next `git gc --cruft`, and its output for the failure message. */
function nextGc(path: string): { readonly status: number | null; readonly output: string } {
  const run = spawnSync('git', ['gc', '--cruft', `--prune=${DROP}`, '--quiet'], { cwd: path, encoding: 'utf8' });
  return { status: run.status, output: `${run.stdout}${run.stderr}`.trim() };
}

describe('a cone rebuild over old garbage with a concurrent git gc (#1127)', () => {
  it('stays connected and writable when a cruft GC reads the refs before the rebuilt cone head is published and packs after', async () => {
    const path = await oldGarbageWithoutConeHead();
    const warp = await open(path);
    let overlapped: OverlappedUpdate = { status: 'not run', stderr: '' };
    const updates = aroundFirstConeHeadUpdate(path, async (_update, args) => { overlapped = await gcOverlapping(path, args); });

    const receipt = await warp.as('alice').execute(intent.node.add({ subject: 'node:4' }));

    expect(updates.map((update) => update.packedOnly)).toEqual([true]);
    expect(overlapped).toEqual({ status: '0', stderr: '' });
    retained(receipt);
    const fsck = connectivity(path);
    expect(fsck.status, fsck.output).toBe(0);
    const next = nextGc(path);
    expect(next.status, next.output).toBe(0);
    retained(await warp.as('alice').execute(intent.node.add({ subject: 'node:5' })));
  }, CASE_TIMEOUT_MS);

  it('keeps a rebuilt cone tree that a cruft GC meets before the cone head names it', async () => {
    const path = await oldGarbageWithoutConeHead();
    const warp = await open(path);
    const updates = aroundFirstConeHeadUpdate(path, async (update) => {
      gc(path, ['--cruft', `--prune=${DROP}`]);
      await update();
    });

    const receipt = await warp.as('alice').execute(intent.node.add({ subject: 'node:4' }));

    expect(updates.map((update) => update.packedOnly)).toEqual([true]);
    retained(receipt);
    const fsck = connectivity(path);
    expect(fsck.status, fsck.output).toBe(0);
  }, CASE_TIMEOUT_MS);

  it('returns write-basis-unavailable, having published nothing, when a GC removes the rebuilt cone tree before the cone head names it, then writes', async () => {
    const path = await oldGarbageWithoutConeHead();
    const before = tip(path, 'alice');
    const warp = await open(path);
    const updates = aroundFirstConeHeadUpdate(path, async (update) => {
      gc(path, ['--prune=now']);
      await update();
    });

    const receipt = await warp.as('alice').execute(intent.node.add({ subject: 'node:4' }));

    expect(updates.map((update) => update.packedOnly)).toEqual([true]);
    expect(unpublished(receipt).cause).toBe('write-basis-unavailable');
    expect(tip(path, 'alice')).toBe(before);
    const fsck = connectivity(path);
    expect(fsck.status, fsck.output).toBe(0);
    retained(await warp.as('alice').execute(intent.node.add({ subject: 'node:4' })));
  }, CASE_TIMEOUT_MS);
});
