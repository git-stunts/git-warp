import { afterEach, describe, expect, it } from 'vitest';
import { intent } from '../../../advanced.ts';
import ObservationAdmitted from '../../../src/domain/services/custody/ObservationAdmitted.ts';
import ObservationPrepared from '../../../src/domain/services/custody/ObservationPrepared.ts';
import RetainedObservation from '../../../src/domain/services/custody/RetainedObservation.ts';
import MeteredObservationCustody, { type MeteredTransition } from '../../helpers/MeteredObservationCustody.ts';
import ObservationCustodyFixture, {
  basisTree, collectGarbage, narrowed, readBindings, readCore, sources, writerCommits,
} from '../../helpers/ObservationCustodyFixture.ts';
import RepositoryObjectCensus from '../../helpers/RepositoryObjectCensus.ts';
import { disposeWarpFixtures, git, open, repository, retained } from '../../helpers/WarpWriteFixture.ts';

/**
 * #1080 attribution probe. It reports where each retained operation's loose
 * objects and refs come from; it asserts nothing about their number, which the
 * cost witness does. Run it with GIT_WARP_RETENTION_PROBE=1.
 */
const ENABLED = process.env['GIT_WARP_RETENTION_PROBE'] === '1';
const WRITES = Number(process.env['GIT_WARP_RETENTION_PROBE_WRITES'] ?? '400');
const READS = Number(process.env['GIT_WARP_RETENTION_PROBE_READS'] ?? '200');
const SAMPLES = new Set([1, 2, 3, 50, 100, 200, 400]);
const TIMEOUT_MS = 1_800_000;
/** A fixed clock: the probe counts objects and never depends on elapsed time. */
const FIXED_TIME_MS = 1_700_000_000_000;
const DETAIL = process.env['GIT_WARP_RETENTION_PROBE_DETAIL'] === '1';

const fixture = new ObservationCustodyFixture();

afterEach(async () => {
  await disposeWarpFixtures();
  await fixture.dispose();
});

type Boundary = { readonly label: string; readonly loose: Set<string> };

/** Records loose-object snapshots at each ledger transition boundary. */
class Attribution {
  readonly #census: RepositoryObjectCensus;
  readonly #boundaries: Boundary[] = [];
  #armed = false;

  constructor(census: RepositoryObjectCensus) {
    this.#census = census;
  }

  start(): void {
    this.#armed = true;
    this.#boundaries.length = 0;
    this.#boundaries.push({ label: 'start', loose: this.#census.loose() });
  }

  mark(transition: MeteredTransition, side: 'before' | 'after'): void {
    if (this.#armed) {
      this.#boundaries.push({ label: `${side}:${transition}`, loose: this.#census.loose() });
    }
  }

  /** Each segment's new objects by type, and where the whole operation's objects end up reachable from. */
  finish(families: readonly string[]): string {
    this.#armed = false;
    const end = this.#census.loose();
    this.#boundaries.push({ label: 'end', loose: end });
    const begin = this.#boundaries[0]?.loose ?? new Set<string>();
    const created = [...end].filter((oid) => !begin.has(oid));
    const types = this.#census.types(created);
    const rows: string[] = [];
    for (let index = 1; index < this.#boundaries.length; index++) {
      const earlier = this.#boundaries[index - 1];
      const later = this.#boundaries[index];
      if (earlier === undefined || later === undefined) {
        continue;
      }
      const added = [...later.loose].filter((oid) => !earlier.loose.has(oid));
      rows.push(`    ${segmentName(earlier.label, later.label).padEnd(28)} ${String(added.length).padStart(4)}  ${byType(added, types)}`);
      if (DETAIL) {
        rows.push(...added.map((oid) => `        ${this.#census.describe(oid, types.get(oid) ?? 'gone')}`));
      }
    }
    const reach = families.map((family) => {
      const reachable = this.#census.reachable(family);
      return `${family}=${created.filter((oid) => reachable.has(oid)).length}`;
    });
    const all = this.#census.reachable();
    const unreachable = created.filter((oid) => !all.has(oid));
    reach.push(`unreachable=${unreachable.length}`);
    if (DETAIL) {
      rows.push('    unreachable once the operation returns:', ...unreachable.map((oid) => `        ${this.#census.describe(oid, types.get(oid) ?? 'gone')}`));
    }
    return [`    total ${created.length}  ${byType(created, types)}`, ...rows, `    reachable from: ${reach.join('  ')}`].join('\n');
  }
}

function segmentName(earlier: string, later: string): string {
  const [earlierSide, earlierName] = earlier.split(':');
  const [laterSide, laterName] = later.split(':');
  if (earlierSide === 'before' && laterSide === 'after' && earlierName === laterName) {
    return `ledger ${laterName ?? ''}`;
  }
  return `between ${earlierName ?? earlier} and ${laterName ?? later}`;
}

function byType(oids: readonly string[], types: ReadonlyMap<string, string>): string {
  const counts = new Map<string, number>();
  for (const oid of oids) {
    const type = types.get(oid) ?? 'gone';
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  return [...counts].sort().map(([type, count]) => `${type}=${count}`).join(' ');
}

function families(census: RepositoryObjectCensus): string {
  return [...census.refFamilies(4)].map(([family, count]) => `${family}=${count}`).join('  ');
}

describe.skipIf(!ENABLED)('#1080 retained operation cost attribution', () => {
  it('attributes retained writes through the real write path', async () => {
    const path = await repository();
    const census = new RepositoryObjectCensus(path);
    const attribution = new Attribution(census);
    const warp = await open(path, { clock: () => FIXED_TIME_MS, wrapCustody: (custody) => new MeteredObservationCustody(custody, (transition, side) => { attribution.mark(transition, side); }) });
    const writer = warp.as('alice');
    console.log(`gc.auto=${git(path, ['config', '--default', 'unset', 'gc.auto'])} git=${git(path, ['--version'])}`);
    let previous = census.counts();
    let gcSeen = false;
    for (let index = 1; index <= WRITES; index++) {
      const sampled = SAMPLES.has(index);
      if (sampled) {
        attribution.start();
      }
      retained(await writer.execute(intent.node.add({ subject: `node:${index}` })));
      const counts = census.counts();
      gcSeen ||= counts.loose < previous.loose || counts.packs > 0;
      if (sampled) {
        console.log(`write ${index}: loose +${counts.loose - previous.loose} (${counts.loose} total, ${counts.looseKiB} KiB) refs=${census.refCount()} packs=${counts.packs}`);
        console.log(attribution.finish(['refs/warp/todos/writers/', 'refs/warp/', 'refs/cas/']));
        console.log(`    refs: ${families(census)}`);
      }
      previous = counts;
    }
    const before = census.counts();
    console.log(`after ${WRITES} writes: loose=${before.loose} looseKiB=${before.looseKiB} perWrite=${(before.loose / WRITES).toFixed(1)} objects ${(before.looseKiB / WRITES).toFixed(1)} KiB refs=${census.refCount()} autoGcObserved=${String(gcSeen || census.autoGcEvidence())}`);
    collectGarbage(path);
    const after = census.counts();
    console.log(`after gc --prune=now: packed=${after.packed} packKiB=${after.packKiB} loose=${after.loose} survivorsPerWrite=${(after.packed / WRITES).toFixed(1)} objects ${(after.packKiB / WRITES).toFixed(2)} KiB`);
    console.log(`garbage per write, superseded objects included: ${((before.loose - after.packed) / WRITES).toFixed(1)} objects`);
    expect(before.loose).toBeGreaterThan(0);
  }, TIMEOUT_MS);

  it('attributes retained reads through custody begin, prepare and settle', async () => {
    const path = await fixture.repository('sha1');
    const census = new RepositoryObjectCensus(path);
    const attribution = new Attribution(census);
    const opened = await fixture.open(path, {
      limit: READS + 1,
      wrap: (custody) => new MeteredObservationCustody(custody, (transition, side) => { attribution.mark(transition, side); }),
    });
    const heads = writerCommits(path, 3);
    let created = 0;
    let createdKiB = 0;
    for (let index = 1; index <= READS; index++) {
      const basis = basisTree(path, `read ${index}`, heads);
      const sampled = SAMPLES.has(index);
      const start = census.counts();
      if (sampled) {
        attribution.start();
      }
      const attempt = narrowed(await opened.service.begin(readBindings(basis)), ObservationAdmitted).attempt;
      narrowed(await opened.service.prepare(attempt, sources()), ObservationPrepared);
      narrowed(await opened.service.settle(attempt, { core: readCore(`read ${index}`), publication: null }), RetainedObservation);
      const counts = census.counts();
      created += counts.loose - start.loose;
      createdKiB += counts.looseKiB - start.looseKiB;
      if (sampled) {
        console.log(`read ${index}: loose +${counts.loose - start.loose} (${counts.loose} total, ${counts.looseKiB} KiB) refs=${census.refCount()}`);
        console.log(attribution.finish(['refs/warp/', 'refs/cas/']));
        console.log(`    refs: ${families(census)}`);
      }
    }
    const before = census.counts();
    console.log(`after ${READS} reads: perRead=${(created / READS).toFixed(1)} objects ${(createdKiB / READS).toFixed(1)} KiB (fixture objects excluded) looseKiB=${before.looseKiB} refs=${census.refCount()}`);
    const fixtureObjects = before.loose - created;
    collectGarbage(path);
    const after = census.counts();
    const kept = after.packed - fixtureObjects;
    console.log(`after gc --prune=now: packed=${after.packed} packKiB=${after.packKiB} fixtureObjects=${fixtureObjects} survivorsPerRead=${(kept / READS).toFixed(1)} garbagePerRead=${((created - kept) / READS).toFixed(1)}`);
    expect(created).toBeGreaterThan(0);
  }, TIMEOUT_MS);
});
