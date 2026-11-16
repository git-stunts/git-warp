import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { intent } from '../../../advanced.ts';
import RepositoryObjectCensus from '../../helpers/RepositoryObjectCensus.ts';
import { disposeWarpFixtures, git, open, repository, retained } from '../../helpers/WarpWriteFixture.ts';

/**
 * #1080 GC regime probe (review round 2, experiment T6). It compares a plain
 * `git gc` with `git gc --cruft` on the same history: what stays loose, and
 * whether the user's own porcelain then warns. It reports; the cost witness
 * asserts. Run it with GIT_WARP_GC_REGIME_PROBE=1.
 *
 * No step reads the wall clock: every loose object is stamped with a fixed
 * mtime, and the prune window is an absolute date before it, so all garbage
 * is "young", as it is under the default two-week window.
 */
const ENABLED = process.env['GIT_WARP_GC_REGIME_PROBE'] === '1';
const WRITES = Number(process.env['GIT_WARP_GC_REGIME_PROBE_WRITES'] ?? '400');
const FIXED_CLOCK = { clock: (): number => 1_700_000_000_000 };
const OBJECT_MTIME_SECONDS = 1_767_225_600;
const YOUNG_EXPIRY = '2025-12-18 00:00:00 +0000';
const TIMEOUT_MS = 1_800_000;

const copies: string[] = [];

afterEach(async () => {
  await disposeWarpFixtures();
  await Promise.all(copies.splice(0).map(async (path) => await rm(path, { recursive: true, force: true })));
});

/** Runs git and returns its combined output, without throwing on a nonzero exit. */
function gitOutput(path: string, args: readonly string[]): string {
  const run = spawnSync('git', [...args], { cwd: path, encoding: 'utf8' });
  return `${run.stdout}${run.stderr}`.trim();
}

async function stampedCopy(path: string): Promise<string> {
  const copy = await mkdtemp(join(tmpdir(), 'warp-gc-regime-'));
  copies.push(copy);
  await cp(path, copy, { recursive: true });
  new RepositoryObjectCensus(copy).stampLoose(OBJECT_MTIME_SECONDS);
  git(copy, ['config', 'gc.pruneExpire', YOUNG_EXPIRY]);
  git(copy, ['config', 'gc.autoDetach', 'false']);
  return copy;
}

function report(label: string, copy: string): void {
  const census = new RepositoryObjectCensus(copy);
  const counts = census.counts();
  console.log(`${label}: loose=${counts.loose} looseKiB=${counts.looseKiB} packs=${counts.packs} cruftPacks=${census.cruftPacks()} unreachable=${census.unreachableCount()}`);
  const auto = gitOutput(copy, ['gc', '--auto']);
  const first = gitOutput(copy, ['commit', '--allow-empty', '--quiet', '-m', 'user commit 1']);
  const gcLog = existsSync(join(copy, '.git', 'gc.log'));
  const second = gitOutput(copy, ['commit', '--allow-empty', '--quiet', '-m', 'user commit 2']);
  console.log(`  gc --auto: ${auto === '' ? '(quiet)' : auto}`);
  console.log(`  first user commit: ${first === '' ? '(quiet)' : first}`);
  console.log(`  gc.log after it: ${String(gcLog)}`);
  console.log(`  second user commit: ${second === '' ? '(quiet)' : second}`);
}

describe.skipIf(!ENABLED)('#1080 GC regime: plain git gc against git gc --cruft', () => {
  it('reports what each regime leaves loose and what the user then sees', async () => {
    const path = await repository();
    const warp = await open(path, FIXED_CLOCK);
    for (let index = 1; index <= WRITES; index++) {
      retained(await warp.as('alice').execute(intent.node.add({ subject: `node:${index}` })));
    }
    await warp.close();
    console.log(`git ${git(path, ['--version'])}, ${WRITES} retained writes, loose=${new RepositoryObjectCensus(path).counts().loose}`);
    const plain = await stampedCopy(path);
    const cruft = await stampedCopy(path);

    git(plain, ['gc', '--quiet']);
    git(cruft, ['gc', '--cruft', '--quiet']);

    const cruftLoose = new RepositoryObjectCensus(cruft).counts().loose;
    report('plain git gc', plain);
    report('git gc --cruft', cruft);
    expect(cruftLoose).toBe(0);
  }, TIMEOUT_MS);
});
