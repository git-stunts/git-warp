import { afterEach, describe, expect, it } from 'vitest';
import { intent } from '../../../advanced.ts';
import ObservationAdmitted from '../../../src/domain/services/custody/ObservationAdmitted.ts';
import ObservationPrepared from '../../../src/domain/services/custody/ObservationPrepared.ts';
import RetainedObservation from '../../../src/domain/services/custody/RetainedObservation.ts';
import ObservationCustodyFixture, {
  basisTree, narrowed, readBindings, readCore, sources, writerCommits,
} from '../../helpers/ObservationCustodyFixture.ts';
import RepositoryObjectCensus from '../../helpers/RepositoryObjectCensus.ts';
import { disposeWarpFixtures, open, repository, retained } from '../../helpers/WarpWriteFixture.ts';

/**
 * #1080 cost witness: the loose objects and refs one retained operation adds
 * to the user's repository. Measured in Docker on git-cas 7.2.0 over these
 * runs: 48 to 53 objects per write and 26 to 29 per read, the range set by the
 * reservation index growing one trie level per sixteenfold more records.
 * git-cas 7.1.0 wrote about 301 per write and 214 per read. The ceilings
 * leave a margin over the measured counts and fail far below the old ones.
 * `RetentionCost.probe.test.ts` attributes each object.
 */
const WRITE_OBJECT_CEILING = 60;
const READ_OBJECT_CEILING = 32;
/** Each retained operation keeps exactly one permanent custody pin. */
const REFS_PER_OPERATION = 1;
const OPERATIONS = 24;
/** The first operation also creates the graph's refs and ledger. */
const WARM_UP = 2;
const CASE_TIMEOUT_MS = 300_000;

const fixture = new ObservationCustodyFixture();

afterEach(async () => {
  await disposeWarpFixtures();
  await fixture.dispose();
});

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
    const writer = (await open(path)).as('alice');

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
});
