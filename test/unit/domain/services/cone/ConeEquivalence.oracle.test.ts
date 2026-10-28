import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type PatchEntry from '../../../../../src/domain/artifacts/PatchEntry.ts';
import ConeFold from '../../../../../src/domain/services/cone/ConeFold.ts';
import ConeFolded from '../../../../../src/domain/services/cone/ConeFolded.ts';
import ConeFoldSession from '../../../../../src/domain/services/cone/ConeFoldSession.ts';
import ConeRoot from '../../../../../src/domain/services/cone/ConeRoot.ts';
import { reducePatches } from '../../../../../src/domain/services/JoinReducer.ts';
import ConeHistoryGenerator, { interleave, type ConeHistoryShape } from '../../../../helpers/ConeHistoryGenerator.ts';
import { assertConeAdmissionsEquivalent, assertConeEquivalent } from '../../../../helpers/coneEquivalence.ts';
import InMemoryConeRecordStore from '../../../../helpers/InMemoryConeRecordStore.ts';
import { createRng } from '../../../../helpers/seededRng.ts';

/** Fixed fast-check seed: every run checks the same histories; a failure prints its history seed. */
const ORACLE_SEED = 1039;
const INTERLEAVINGS = 3;

const SHAPES: ReadonlyArray<{ readonly name: string; readonly runs: number; readonly shape: ConeHistoryShape }> = [
  { name: 'small dense', runs: 80, shape: { writers: 3, patches: 30, nodes: 4, maxOps: 3, syncChance: 0.5 } },
  { name: 'wide concurrent', runs: 40, shape: { writers: 5, patches: 60, nodes: 8, maxOps: 4, syncChance: 0.2 } },
  { name: 'long synced', runs: 20, shape: { writers: 3, patches: 150, nodes: 6, maxOps: 3, syncChance: 0.8 } },
];

type Totals = { histories: number; patches: number; folds: number; entities: number; admissions: number; ops: Map<string, number> };

/** Folds `order` into a fresh trie, committing every `chunk` patches, and returns the final root. */
async function foldAll(store: InMemoryConeRecordStore, order: readonly PatchEntry[], chunk: number): Promise<ConeRoot> {
  let root = ConeRoot.empty();
  for (let start = 0; start < order.length; start += chunk) {
    const session = new ConeFoldSession({ store, root, flushRecords: 7 });
    for (const entry of order.slice(start, start + chunk)) {
      const outcome = await ConeFold.fold(session, entry);
      expect(outcome).toBeInstanceOf(ConeFolded);
    }
    root = await session.commit();
  }
  return root;
}

async function checkHistory(seed: number, shape: ConeHistoryShape, totals: Totals): Promise<void> {
  const history = new ConeHistoryGenerator(seed, shape).generate();
  const chainOrder = [...history.chains.values()].flat();
  const full = reducePatches(chainOrder.map((entry) => ({ patch: entry.patch, sha: entry.sha })));
  const rng = createRng(seed ^ 0x5eed);
  for (let run = 0; run < INTERLEAVINGS; run += 1) {
    const store = new InMemoryConeRecordStore();
    const order = interleave(rng, history.chains);
    const root = await foldAll(store, order, rng.nextInt(1, order.length + 1));
    totals.entities += await assertConeEquivalent(history, full, { store, root });
    totals.admissions += await assertConeAdmissionsEquivalent(history, { store, root });
    totals.folds += order.length;
  }
  totals.histories += 1;
  totals.patches += chainOrder.length;
  for (const [kind, count] of history.opCounts) {
    totals.ops.set(kind, (totals.ops.get(kind) ?? 0) + count);
  }
}

describe('cone engine equivalence oracle (#1039): entity state and the entity admission index', () => {
  for (const { name, runs, shape } of SHAPES) {
    it(`matches a full JoinReducer reduction for every entity: ${name}`, async () => {
      const totals: Totals = { histories: 0, patches: 0, folds: 0, entities: 0, admissions: 0, ops: new Map() };
      await fc.assert(
        fc.asyncProperty(fc.integer({ min: 1, max: 0x7fffffff }), async (seed) => { await checkHistory(seed, shape, totals); }),
        { seed: ORACLE_SEED, numRuns: runs },
      );
      console.log('CONE_ORACLE', JSON.stringify({ name, shape, ...totals, ops: Object.fromEntries(totals.ops) }));
      expect(totals.histories).toBe(runs);
      expect(totals.admissions).toBeGreaterThan(0);
    }, 300_000);
  }
});
