import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { intent } from '../../../advanced.ts';
import ObservationAdmitted from '../../../src/domain/services/custody/ObservationAdmitted.ts';
import ObservationPrepared from '../../../src/domain/services/custody/ObservationPrepared.ts';
import RetainedObservation from '../../../src/domain/services/custody/RetainedObservation.ts';
import ObservationCustodyFixture, {
  basisTree, narrowed, readBindings, readCore, sources, writerCommits,
} from '../../helpers/ObservationCustodyFixture.ts';
import RepositoryObjectCensus from '../../helpers/RepositoryObjectCensus.ts';
import { disposeWarpFixtures, git, open, repository, retained, tip } from '../../helpers/WarpWriteFixture.ts';

/**
 * #1080 cost witness: the loose objects and refs one retained operation adds
 * to the user's repository, on git-cas 7.2.0. Measured in Docker by the probe
 * (`RetentionCost.probe.test.ts`): 48 to 57 objects per write over 400 writes,
 * and 26 to 32 per custody read over 200 reads. The count rises slowly with
 * history: each sixteenfold growth in records adds one trie level to each
 * ledger generation, that is up to 4 objects per write and 3 per read.
 * git-cas 7.1.0 wrote about 301 per write and 214 per read.
 *
 * The ceilings hold at this witness's scale of 24 operations, where the
 * counts are at most 53 and 29, and with margin up to about 400 writes and
 * 200 reads. They fail far below the 7.1.0 counts.
 */
const WRITE_OBJECT_CEILING = 64;
const READ_OBJECT_CEILING = 40;
/** Each retained operation keeps exactly one permanent custody pin. */
const REFS_PER_OPERATION = 1;
const OPERATIONS = 24;
/** The first operation also creates the graph's refs, namespace policy and ledger, so it is left out. */
const WARM_UP = 1;
/** Writes before the garbage collection check; each leaves at least this much garbage. */
const GC_WRITES = 24;
const GARBAGE_PER_WRITE_FLOOR = 15;
const CASE_TIMEOUT_MS = 300_000;
/** A fixed clock: these checks count objects and never depend on elapsed time. */
const FIXED_CLOCK = { clock: (): number => 1_700_000_000_000 };

const fixture = new ObservationCustodyFixture();
const copies: string[] = [];

afterEach(async () => {
  await disposeWarpFixtures();
  await fixture.dispose();
  await Promise.all(copies.splice(0).map(async (path) => await rm(path, { recursive: true, force: true })));
});

/** A copy of `path` that nothing writes to, so pruning it races no writer. */
async function idleCopy(path: string): Promise<string> {
  const copy = await mkdtemp(join(tmpdir(), 'warp-gc-copy-'));
  copies.push(copy);
  await cp(path, copy, { recursive: true });
  return copy;
}

type Cost = { readonly objects: number; readonly refs: number };

/** The loose objects and refs each of `count` operations added after warm-up. */
async function costs(census: RepositoryObjectCensus, count: number, operation: (index: number) => Promise<void>): Promise<Cost[]> {
  const measured: Cost[] = [];
  for (let index = 1; index <= count; index++) {
    const objects = census.counts().loose;
    const refs = census.refCount();
    await operation(index);
    if (index > WARM_UP) {
      measured.push({ objects: census.counts().loose - objects, refs: census.refCount() - refs });
    }
  }
  return measured;
}

describe('retained operation cost (#1080)', () => {
  it('keeps each retained write under its loose-object ceiling, with one permanent ref', async () => {
    const path = await repository();
    const census = new RepositoryObjectCensus(path);
    const writer = (await open(path, FIXED_CLOCK)).as('alice');

    const measured = await costs(census, OPERATIONS, async (index) => {
      retained(await writer.execute(intent.node.add({ subject: `node:${index}` })));
    });

    expect(Math.max(...measured.map((cost) => cost.objects))).toBeLessThanOrEqual(WRITE_OBJECT_CEILING);
    expect(measured.map((cost) => cost.refs)).toEqual(measured.map(() => REFS_PER_OPERATION));
  }, CASE_TIMEOUT_MS);

  it('keeps each retained read under its loose-object ceiling, with one permanent ref', async () => {
    const path = await fixture.repository('sha1');
    const census = new RepositoryObjectCensus(path);
    const { service } = await fixture.open(path, { limit: OPERATIONS });
    const heads = writerCommits(path, 3);
    const bases = Array.from({ length: OPERATIONS }, (_, index) => basisTree(path, `read ${index + 1}`, heads));

    const measured = await costs(census, OPERATIONS, async (index) => {
      const attempt = narrowed(await service.begin(readBindings(bases[index - 1] ?? '')), ObservationAdmitted).attempt;
      narrowed(await service.prepare(attempt, sources()), ObservationPrepared);
      narrowed(await service.settle(attempt, { core: readCore(`read ${index}`), publication: null }), RetainedObservation);
    });

    expect(Math.max(...measured.map((cost) => cost.objects))).toBeLessThanOrEqual(READ_OBJECT_CEILING);
    expect(measured.map((cost) => cost.refs)).toEqual(measured.map(() => REFS_PER_OPERATION));
  }, CASE_TIMEOUT_MS);

  it('leaves garbage that a plain git gc keeps inside gc.pruneExpire and removes outside it', async () => {
    const path = await repository();
    const warp = await open(path, FIXED_CLOCK);
    for (let index = 1; index <= GC_WRITES; index++) {
      retained(await warp.as('alice').execute(intent.node.add({ subject: `node:${index}` })));
    }
    await warp.close();
    const young = await idleCopy(path);
    const expired = await idleCopy(path);
    const garbage = new RepositoryObjectCensus(young).unreachableCount();
    const refs = new RepositoryObjectCensus(young).refCount();

    // Test-only prune windows stand in for elapsed time: `never` keeps garbage of any age, `now` prunes all of it.
    git(young, ['-c', 'gc.pruneExpire=never', 'gc', '--quiet']);
    git(expired, ['-c', 'gc.pruneExpire=now', 'gc', '--quiet']);

    expect(garbage).toBeGreaterThanOrEqual(GARBAGE_PER_WRITE_FLOOR * GC_WRITES);
    expect(new RepositoryObjectCensus(young).unreachableCount()).toBe(garbage);
    const pruned = new RepositoryObjectCensus(expired);
    expect(pruned.unreachableCount()).toBe(0);
    expect(pruned.counts().loose).toBe(0);
    expect(pruned.refCount()).toBe(refs);
    expect(git(expired, ['fsck', '--connectivity-only', '--no-progress'])).toBe('');
    expect(git(expired, ['cat-file', '-t', tip(path, 'alice') ?? ''])).toBe('commit');
  }, CASE_TIMEOUT_MS);
});
