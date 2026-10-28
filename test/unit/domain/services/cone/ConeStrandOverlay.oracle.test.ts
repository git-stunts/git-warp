import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import ConeBasis from '../../../../../src/domain/services/cone/ConeBasis.ts';
import ConeBasisHead from '../../../../../src/domain/services/cone/ConeBasisHead.ts';
import ConeFootprint from '../../../../../src/domain/services/cone/ConeFootprint.ts';
import ConeLaneBasis from '../../../../../src/domain/services/cone/ConeLaneBasis.ts';
import ConeTipSource from '../../../../../src/domain/services/cone/ConeTipSource.ts';
import { reducePatches } from '../../../../../src/domain/services/JoinReducer.ts';
import type PatchEntry from '../../../../../src/domain/artifacts/PatchEntry.ts';
import ConeHistoryGenerator, { type ConeHistoryShape } from '../../../../helpers/ConeHistoryGenerator.ts';
import { assertConeEquivalent } from '../../../../helpers/coneEquivalence.ts';
import InMemoryConeRecordStore from '../../../../helpers/InMemoryConeRecordStore.ts';
import MemoryConeFeed from '../../../../helpers/MemoryConeFeed.ts';

/** Fixed fast-check seed: every run checks the same histories; a failure prints its history seed. */
const ORACLE_SEED = 1040;
const LANE = 'events';
const STRAND_ID = 'c'.repeat(64);
const SHAPE: ConeHistoryShape = { writers: 3, patches: 40, nodes: 5, maxOps: 3, syncChance: 0.4 };

/** The strand's tips: the base writers' tips plus the overlay chain's head. */
class FixedTips extends ConeTipSource {
  readonly #tips: ReadonlyMap<string, string>;

  constructor(tips: ReadonlyMap<string, string>) {
    super();
    this.#tips = tips;
  }

  override tips(): Promise<ReadonlyMap<string, string>> {
    return Promise.resolve(this.#tips);
  }
}

function requireBasis(value: ConeBasis | object): ConeBasis {
  if (!(value instanceof ConeBasis)) { throw new Error('expected a cone basis'); }
  return value;
}

function tipsOf(chains: ReadonlyMap<string, readonly PatchEntry[]>): Map<string, string> {
  return new Map([...chains].flatMap(([writer, chain]) => {
    const tip = chain[chain.length - 1];
    return tip === undefined ? [] : [[writer, tip.sha] as const];
  }));
}

/**
 * Folds the base writers into a pinned base, then the last writer's chain as
 * the strand overlay on top, and compares the overlay with a full reduction
 * of base and overlay patches. Records the overlay never touched must stay
 * shared with the base root.
 */
async function checkOverlay(seed: number): Promise<number> {
  const history = new ConeHistoryGenerator(seed, SHAPE).generate();
  const writers = [...history.chains.keys()];
  const overlayWriter = writers[writers.length - 1] ?? 'w0';
  const baseChains = new Map([...history.chains].filter(([writer]) => writer !== overlayWriter));
  const feed = new MemoryConeFeed(LANE);
  for (const [writer, chain] of history.chains) { feed.chains.set(writer, [...chain]); }
  const store = new InMemoryConeRecordStore();
  const ports = { store, feed };
  const base = ConeLaneBasis.ofStrandBase({ ...ports, lane: LANE, strandId: STRAND_ID, baseFrontier: tipsOf(baseChains) });
  const strand = ConeLaneBasis.ofStrand({ ...ports, strandId: STRAND_ID, tips: new FixedTips(tipsOf(history.chains)), base });
  const strandBasis = requireBasis(await strand.advance());
  const baseBasis = requireBasis(await base.advance());
  const all = [...history.chains.values()].flat();
  const full = reducePatches(all.map((entry) => ({ patch: entry.patch, sha: entry.sha })));
  const entities = await assertConeEquivalent(history, full, { store, root: strandBasis.root });
  const overlayKeys = new Set((history.chains.get(overlayWriter) ?? [])
    .flatMap((entry) => ConeFootprint.of(entry.patch).recordKeys().map((key) => key.toString())));
  const baseRecords = new Map(store.allRecords(baseBasis.root).map((record) => [record.key().toString(), record]));
  for (const record of store.allRecords(strandBasis.root)) {
    const key = record.key().toString();
    if (!overlayKeys.has(key) && record.key().family !== 'adjacency') {
      expect(record, `record ${key} shared with the base, seed ${seed}`).toBe(baseRecords.get(key));
    }
  }
  expect((await store.readBasis(ConeBasisHead.forStrandBase(LANE, STRAND_ID)))?.basis.equals(baseBasis)).toBe(true);
  return entities;
}

describe('strand overlay equivalence oracle (#1039)', () => {
  it('folds a strand overlay over its pinned base exactly as a full reduction of base and strand patches', async () => {
    let histories = 0;
    let entities = 0;
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 0x7fffffff }), async (seed) => {
        entities += await checkOverlay(seed);
        histories += 1;
      }),
      { seed: ORACLE_SEED, numRuns: 60 },
    );
    console.log('CONE_STRAND_ORACLE', JSON.stringify({ histories, entities, shape: SHAPE }));
    expect(histories).toBe(60);
  }, 300_000);
});
