import { execFileSync } from 'node:child_process';
import { afterAll, expect, it } from 'vitest';
import { WARP_WRITER_LIMIT } from '../../../src/application/WarpWriteComposition.ts';
import { gitProcesses, withEnvironment } from '../../helpers/GitProcessCount.ts';
import { createRng } from '../../helpers/seededRng.ts';
import * as fixture from '../../helpers/WarpWriteFixture.ts';
import * as seeds from '../../helpers/WriterChainSeed.ts';
import { POOL_COMMIT_DATE } from '../../helpers/WriterPoolImport.ts';

/**
 * The writer-frontier fixtures' pool of writer chains (#1197): `appendPool` must write the
 * chains the patch journal appends, and must do it at a cost that does not grow with the
 * pool. The cost is counted in Git processes, not time, so the bound holds on any runner.
 */
const POOL = seeds.poolOf(WARP_WRITER_LIMIT - 2);
const SAMPLE_SEED = 1197;
const rng = createRng(SAMPLE_SEED);
/** Pool writers compared with the journal: the first, the last, and six more drawn with {@link SAMPLE_SEED}. */
const SAMPLE = [...new Set([...POOL.slice(0, 1), ...POOL.slice(-1), ...Array.from({ length: 6 }, () => rng.pick([...POOL]))])].sort();
/**
 * Git processes `appendPool` may start for a pool of any size. Its fixed cost is 19 today:
 * one journal append for the pattern chain, the reads that check the pattern, and one
 * `git fast-import`. One journal append per writer started 28,660 for this pool.
 */
const POOL_PROCESS_BOUND = 32;
const CASE_TIMEOUT_MS = 240_000;

afterAll(async () => {
  await seeds.disposeWriterChainSeeds();
});

async function repository(format: string): Promise<string> {
  const path = await seeds.scratchDirectory('writer-pool-import-');
  fixture.git(path, ['init', '--quiet', `--object-format=${format}`]);
  return path;
}

/** Every ref with its object, and every object with its type and size: the repository, byte for byte. */
function contents(path: string): { readonly refs: string; readonly objects: string } {
  return {
    refs: fixture.git(path, ['for-each-ref', '--format=%(refname) %(objectname)']),
    objects: execFileSync('git', ['cat-file', '--batch-all-objects', '--batch-check'], { cwd: path, encoding: 'utf8' }).trim(),
  };
}

it.each(['sha1', 'sha256'])('imports the pool chains the patch journal appends, object for object, in a %s repository', async (format) => {
  const journal = await repository(format);
  const imported = await repository(format);
  // The journal's commits take their date from Git's environment; the import uses its fixed date.
  const date = { GIT_AUTHOR_DATE: POOL_COMMIT_DATE, GIT_COMMITTER_DATE: POOL_COMMIT_DATE };
  await withEnvironment(date, async () => await seeds.appendChains(journal, SAMPLE));

  await seeds.appendPool(imported, SAMPLE);

  // Oracle: the production patch journal, appending the same writers' chains (differential).
  expect(contents(imported)).toEqual(contents(journal));
  expect(seeds.writerChains(imported)).toBe(SAMPLE.length);
}, CASE_TIMEOUT_MS);

it(`seeds ${POOL.length} pool writer chains with as many Git processes as 2, and at most ${POOL_PROCESS_BOUND}`, async () => {
  const small = await repository('sha1');
  const path = await repository('sha1');
  const two = await gitProcesses(async () => await seeds.appendPool(small, POOL.slice(0, 2)));

  const whole = await gitProcesses(async () => await seeds.appendPool(path, POOL));

  expect(whole, `Git processes to seed ${POOL.length} writer chains`).toBeLessThanOrEqual(POOL_PROCESS_BOUND);
  expect(whole, 'Git processes to seed 2 writer chains').toBe(two);
  expect(seeds.writerChains(path)).toBe(POOL.length);
}, CASE_TIMEOUT_MS);
