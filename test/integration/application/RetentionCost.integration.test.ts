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
 * At this witness's scale of 24 operations, the highest counts seen over
 * several runs were 56 per write and 32 per read; they vary between runs
 * because random attempt ids change the trie depth. The ceilings leave a
 * margin of 8 over those maxima, hold up to about 400 writes and 200 reads,
 * and fail far below the 7.1.0 counts.
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
/**
 * Fixed object ages and absolute prune dates stand in for elapsed time, so no
 * check reads the wall clock: every loose object is stamped 2026-01-01, then
 * pruned against a date before it (inside the window) or after it (outside).
 */
const OBJECT_MTIME_SECONDS = 1_767_225_600;
const EXPIRY_BEFORE_MTIME = '2025-12-18 00:00:00 +0000';
const EXPIRY_AFTER_MTIME = '2026-01-15 00:00:00 +0000';
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

  it('packs garbage into a cruft pack inside gc.pruneExpire and removes it outside, under git gc --cruft', async () => {
    const path = await repository();
    const warp = await open(path, FIXED_CLOCK);
    for (let index = 1; index <= GC_WRITES; index++) {
      retained(await warp.as('alice').execute(intent.node.add({ subject: `node:${index}` })));
    }
    await warp.close();
    const inWindow = await idleCopy(path);
    const expired = await idleCopy(path);
    for (const copy of [inWindow, expired]) {
      new RepositoryObjectCensus(copy).stampLoose(OBJECT_MTIME_SECONDS);
    }
    const garbage = new RepositoryObjectCensus(inWindow).unreachableCount();
    const refs = new RepositoryObjectCensus(inWindow).refCount();

    git(inWindow, ['-c', `gc.pruneExpire=${EXPIRY_BEFORE_MTIME}`, 'gc', '--cruft', '--quiet']);
    git(expired, ['-c', `gc.pruneExpire=${EXPIRY_AFTER_MTIME}`, 'gc', '--cruft', '--quiet']);

    expect(garbage).toBeGreaterThanOrEqual(GARBAGE_PER_WRITE_FLOOR * GC_WRITES);
    const kept = new RepositoryObjectCensus(inWindow);
    expect(kept.counts().loose).toBe(0);
    expect(kept.cruftPacks()).toBe(1);
    expect(kept.unreachableCount()).toBe(garbage);
    const pruned = new RepositoryObjectCensus(expired);
    expect(pruned.counts().loose).toBe(0);
    expect(pruned.unreachableCount()).toBe(0);
    for (const copy of [inWindow, expired]) {
      expect(new RepositoryObjectCensus(copy).refCount()).toBe(refs);
      expect(git(copy, ['fsck', '--connectivity-only', '--no-dangling', '--no-progress'])).toBe('');
      expect(git(copy, ['cat-file', '-t', tip(path, 'alice') ?? ''])).toBe('commit');
    }
  }, CASE_TIMEOUT_MS);
});
