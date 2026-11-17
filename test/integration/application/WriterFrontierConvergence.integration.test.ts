import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { WARP_WRITER_LIMIT } from '../../../src/application/WarpWriteComposition.ts';
import { createRng } from '../../helpers/seededRng.ts';
import * as fixture from '../../helpers/WarpWriteFixture.ts';
import * as seeds from '../../helpers/WriterChainSeed.ts';

/**
 * Three clones whose writer frontiers pass the writer limit together converge (#1197,
 * section 2e, candidate 1). Each clone starts from one seed of `LIMIT - 1` folded writer
 * chains; two clones each admit a newcomer of their own, so every clone holds 4,097
 * chains once they have exchanged them through the documented recipes. Every writer
 * then writes again, the clones exchange once more, and all three read the same graph.
 * The order in which clones publish and receive comes from a fixed seed, which the test
 * title names; change it to replay another order.
 */
const LIMIT = WARP_WRITER_LIMIT;
const SYNC_ORDER_SEED = 1197;
const rng = createRng(SYNC_ORDER_SEED);
const SEED_TIMEOUT_MS = 480_000;
const CLONES = [
  { writer: seeds.EXISTING_WRITER, newcomer: false },
  { writer: 'bob', newcomer: true },
  { writer: 'carol', newcomer: true },
];

type Clone = { readonly path: string; readonly writer: string };

let clones: readonly Clone[] = [];
let firstWrites: readonly string[] = [];
let chainsAfterExchange: readonly number[] = [];
let secondWrites: readonly string[] = [];
let readings: readonly { nodes: string[]; edges: string[] }[] = [];

/** Runs a recipe from `docs/topics/sync.md` in `clone`, as its writer. */
async function runRecipe(clone: Clone, heading: string): Promise<void> {
  const recipe = await seeds.syncRecipe(heading);
  execFileSync('sh', ['-c', `LANE=${fixture.GRAPH}\nWRITER=${clone.writer}\n${recipe}`], { cwd: clone.path, stdio: 'pipe' });
}

/** Every clone publishes, then every clone receives, each round in a seeded order. */
async function exchange(): Promise<void> {
  for (const clone of rng.shuffle([...clones])) {
    await runRecipe(clone, 'Publish this writer');
  }
  for (const clone of rng.shuffle([...clones])) {
    await runRecipe(clone, 'Receive other writers');
  }
}

beforeAll(async () => {
  const seed = await seeds.seedRepository(seeds.poolOf(LIMIT - 2));
  const hub = await seeds.hubOf(seed);
  clones = await Promise.all(CLONES.map(async ({ writer }) => ({ path: await seeds.copyOf(seed), writer })));
  for (const clone of clones) {
    fixture.git(clone.path, ['remote', 'add', 'origin', hub]);
  }
  const newcomers = clones.filter((_clone, index) => CLONES[index]?.newcomer === true);
  firstWrites = await Promise.all(newcomers.map(async (clone) => await seeds.writeOnce(clone.path, clone.writer, `first-from-${clone.writer}`)));
  await exchange();
  chainsAfterExchange = clones.map((clone) => seeds.writerChains(clone.path));
  secondWrites = [];
  for (const clone of clones) {
    secondWrites = [...secondWrites, await seeds.writeOnce(clone.path, clone.writer, `second-from-${clone.writer}`)];
  }
  await exchange();
  readings = await Promise.all(clones.map(async (clone) => await fixture.materialized(clone.path)));
}, SEED_TIMEOUT_MS * 2);

afterAll(async () => {
  await fixture.disposeWarpFixtures();
  await seeds.disposeWriterChainSeeds();
});

it('admits each clone\'s newcomer at 4,095 writer chains, and gives every clone 4,097 after one exchange', () => {
  expect([...firstWrites, ...chainsAfterExchange]).toEqual(['retained', 'retained', LIMIT + 1, LIMIT + 1, LIMIT + 1]);
});

it('lets every writer write again on a clone past the limit', () => {
  expect(secondWrites).toEqual(['retained', 'retained', 'retained']);
});

it(`reads the same graph on all three clones after a second exchange (sync order seed ${SYNC_ORDER_SEED})`, () => {
  const [first, ...others] = readings;

  expect(first?.nodes).toContain('second-from-carol');
  expect(others).toEqual([first, first]);
});
