import { afterEach, describe, expect, it, vi } from 'vitest';
import { intent } from '../../../advanced.ts';
import { execFileSync } from 'node:child_process';
import { GitStorage, UnretainedWriteReceipt, WarpAddress, type RetainedWriteReceipt, type Warp } from '../../../index.ts';
import { composeWarpWrites } from '../../../src/application/WarpWriteComposition.ts';
import type WriteRace from '../../../src/domain/api/WriteRace.ts';
import WarpError from '../../../src/domain/errors/WarpError.ts';
import CustodyIndeterminate from '../../../src/domain/services/custody/CustodyIndeterminate.ts';
import ObservationCoordinate from '../../../src/domain/services/custody/ObservationCoordinate.ts';
import ObservationReceiptCore from '../../../src/domain/services/custody/ObservationReceiptCore.ts';
import ResolvedObservation from '../../../src/domain/services/custody/ResolvedObservation.ts';
import { canonicalStringify } from '../../../src/domain/utils/canonicalStringify.ts';
import GitWriteAttemptJournalAdapter from '../../../src/infrastructure/adapters/GitWriteAttemptJournalAdapter.ts';
import ObservationCustodyCborCodec from '../../../src/infrastructure/adapters/ObservationCustodyCborCodec.ts';
import codec from '../../../src/infrastructure/codecs/CborCodec.ts';
import type ObservationCustodyPort from '../../../src/ports/ObservationCustodyPort.ts';
import { GRAPH, TestAccess, attemptRefs, disposeWarpFixtures, git, open, repository, retained, unseen, boundRaces } from '../../helpers/WarpWriteFixture.ts';

afterEach(async () => {
  vi.restoreAllMocks();
  await disposeWarpFixtures();
});

function wire(race: WriteRace): object {
  const { kind, subject, key, writers, overflow, causality } = race;
  return { kind, subject, key, writers: [...writers], overflow, causality };
}

/** The races bound in a retained receipt's canonical core, read back from custody. */
async function coreRaces(path: string, receipt: RetainedWriteReceipt): Promise<string> {
  const writes = await composeWarpWrites(WarpAddress.of(GitStorage.at(path), GRAPH), new TestAccess());
  try {
    const coordinate = ObservationCoordinate.parse(receipt.coordinate.toString());
    const resolved = coordinate === null ? null : await writes.custody.resolve(coordinate);
    if (!(resolved instanceof ResolvedObservation)) {
      throw new Error('Expected the retained evidence to resolve');
    }
    const core = new ObservationCustodyCborCodec(codec).decodeCore(resolved.core());
    if (!(core instanceof ObservationReceiptCore)) {
      throw new Error('Expected a decodable receipt core');
    }
    return boundRaces(core);
  } finally {
    await writes.close();
  }
}

const settleUnavailable = (custody: ObservationCustodyPort): ObservationCustodyPort => new Proxy(custody, {
  get(target: ObservationCustodyPort, name: string | symbol) {
    if (name === 'settle') {
      return () => Promise.resolve(new CustodyIndeterminate(new Error('store went away')));
    }
    const value = Reflect.get(target, name) as unknown;
    return typeof value === 'function' ? value.bind(target) : value;
  },
});

/** `underdetermined`: the rival writes through the legacy patch path (see `unseen`), which records no causality. */
const BOB_TITLE = { kind: 'register', subject: 'doc', key: 'title', writers: ['bob'], overflow: 0, causality: 'underdetermined' };
const CAROL_TITLE = { ...BOB_TITLE, writers: ['carol'] };
const BOB_REMOVED = { kind: 'lifecycle', subject: 'doc', key: null, writers: ['bob'], overflow: 0, causality: 'underdetermined' };

describe('a retained write keeps the races it was admitted with', () => {
  it('binds the exact race of two writers on one property in its core (golden)', async () => {
    const path = await repository();
    const warp = await open(path);
    retained(await warp.as('alice').execute([intent.node.add({ subject: 'doc' }), intent.property.set({ subject: 'doc', key: 'title', value: 'one' })]));
    await unseen(path, 'bob', (patch) => { patch.setProperty('doc', 'title', 'unseen'); });

    const raced = retained(await warp.as('alice').execute(intent.property.set({ subject: 'doc', key: 'title', value: 'two' })));

    expect(raced.outcome.kind).toBe('plural');
    expect(raced.outcome.races.map(wire)).toEqual([BOB_TITLE]);
    expect(await coreRaces(path, raced)).toBe(canonicalStringify([BOB_TITLE]));
  });

  it('rebuilds the exact race set after an interrupted settlement', async () => {
    const path = await repository();
    const first = await open(path);
    retained(await first.as('alice').execute([intent.node.add({ subject: 'doc' }), intent.property.set({ subject: 'doc', key: 'title', value: 'one' })]));
    await first.close();
    await unseen(path, 'bob', (patch) => { patch.setProperty('doc', 'title', 'unseen'); });
    const crashed = await open(path, { wrapCustody: settleUnavailable });

    const interrupted = await crashed.as('alice').execute(intent.property.set({ subject: 'doc', key: 'title', value: 'two' }));
    if (!(interrupted instanceof UnretainedWriteReceipt) || interrupted.attempt === null) {
      throw new Error('Expected a repeatable unretained receipt');
    }
    await crashed.close();
    const rebuilt = retained(await (await open(path)).as('alice').reconcile(interrupted.attempt));

    expect(interrupted.outcome.races.map(wire)).toEqual([BOB_TITLE]);
    expect(rebuilt.outcome.kind).toBe('plural');
    expect(rebuilt.outcome.races.map(wire)).toEqual([BOB_TITLE]);
    expect(await coreRaces(path, rebuilt)).toBe(canonicalStringify([BOB_TITLE]));
    expect(attemptRefs(path)).toEqual([]);
  });

  it('binds an empty race list for a derived write', async () => {
    const path = await repository();
    const warp = await open(path);

    const derived = retained(await warp.as('alice').execute(intent.node.add({ subject: 'doc' })));

    expect(derived.outcome.kind).toBe('derived');
    expect(await coreRaces(path, derived)).toBe(canonicalStringify([]));
  });

  it('names every concurrent sibling writer of one register once', async () => {
    const path = await repository();
    const warp = await open(path);
    retained(await warp.as('alice').execute([intent.node.add({ subject: 'doc' }), intent.property.set({ subject: 'doc', key: 'title', value: 'one' })]));
    await unseen(path, 'carol', (patch) => { patch.setProperty('doc', 'title', 'carols'); });
    await unseen(path, 'bob', (patch) => { patch.setProperty('doc', 'title', 'bobs'); });

    const raced = retained(await warp.as('alice').execute(intent.property.set({ subject: 'doc', key: 'title', value: 'two' })));
    const expected = [{ ...BOB_TITLE, writers: ['bob', 'carol'] }];

    expect(raced.outcome.races.map(wire)).toEqual(expected);
    expect(await coreRaces(path, raced)).toBe(canonicalStringify(expected));
  });

  it('keeps a node lifecycle race apart from a property register race', async () => {
    const path = await repository();
    const warp = await open(path);
    retained(await warp.as('alice').execute([intent.node.add({ subject: 'doc' }), intent.property.set({ subject: 'doc', key: 'title', value: 'one' })]));
    await unseen(path, 'bob', (patch) => { patch.removeNode('doc'); });
    await unseen(path, 'carol', (patch) => { patch.setProperty('doc', 'title', 'carols'); });

    const raced = retained(await warp.as('alice').execute(intent.property.set({ subject: 'doc', key: 'title', value: 'two' })));

    expect(raced.outcome.races.map(wire)).toEqual([BOB_REMOVED, CAROL_TITLE]);
    expect(await coreRaces(path, raced)).toBe(canonicalStringify([BOB_REMOVED, CAROL_TITLE]));
  });
});

describe('a receipt rebuilt from custody', () => {
  /** A plural write whose record outlived its settlement, as after a crash before the record was removed. */
  async function settledWithRecord(path: string): Promise<{ readonly warp: Warp; readonly receipt: RetainedWriteReceipt; readonly ref: string }> {
    const warp = await open(path);
    retained(await warp.as('alice').execute([intent.node.add({ subject: 'doc' }), intent.property.set({ subject: 'doc', key: 'title', value: 'one' })]));
    await unseen(path, 'bob', (patch) => { patch.setProperty('doc', 'title', 'unseen'); });
    vi.spyOn(GitWriteAttemptJournalAdapter.prototype, 'remove').mockRejectedValueOnce(new Error('ref store went away'));
    const receipt = retained(await warp.as('alice').execute(intent.property.set({ subject: 'doc', key: 'title', value: 'two' })));
    const [ref = ''] = attemptRefs(path);
    return { warp, receipt, ref };
  }

  it('reports the races its retained core binds', async () => {
    const path = await repository();
    const { warp, receipt, ref } = await settledWithRecord(path);

    const rebuilt = retained(await warp.as('alice').reconcile(ref.split('/').at(-1) ?? ''));

    expect(rebuilt.coordinate.toString()).toBe(receipt.coordinate.toString());
    expect(rebuilt.outcome.races.map(wire)).toEqual([BOB_TITLE]);
  });

  it('refuses a record whose races differ from its retained core, and keeps it', async () => {
    const path = await repository();
    const { warp, ref } = await settledWithRecord(path);
    const stored: { readonly [field: string]: unknown } = codec.decode(execFileSync('git', ['cat-file', 'blob', git(path, ['rev-parse', ref])], { cwd: path }));
    const altered = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: path, input: codec.encode({ ...stored, races: [['register', 'doc', 'title', ['mallory'], 0, 'underdetermined']] }) });
    git(path, ['update-ref', ref, altered.toString().trim()]);

    const refused = await warp.as('alice').reconcile(ref.split('/').at(-1) ?? '').then(() => null, (error: Error) => error);

    expect(refused instanceof WarpError ? refused.code : refused).toBe('E_WRITE_CORE_MISMATCH');
    expect(attemptRefs(path)).toEqual([ref]);
  });
});

describe('races under randomized interleavings', () => {
  /** A small deterministic generator, so a failure names the seed that reproduces it. */
  function generator(seed: number): () => number {
    let state = seed >>> 0;
    return () => {
      state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
      return state / 2 ** 32;
    };
  }

  /**
   * What the receipt should report, worked out apart from the code under test: Alice's Warp never
   * reads, so every value another writer set on a key after Alice began writing stays unobserved,
   * and each such key races once, naming those writers.
   */
  function expectedRaces(unobserved: ReadonlyMap<string, ReadonlySet<string>>, keys: readonly string[]): object[] {
    return [...keys].sort().flatMap((key) => {
      const writers = [...(unobserved.get(key) ?? [])].sort();
      return writers.length === 0 ? [] : [{ kind: 'register', subject: 'doc', key, writers, overflow: 0, causality: 'underdetermined' }];
    });
  }

  it.each([1, 7, 42])('reports the races an independent oracle expects, and binds them in the core (seed %i)', async (seed) => {
    const next = generator(seed);
    const path = await repository();
    const warp = await open(path);
    const keys = ['title', 'body', 'tag'];
    const unobserved = new Map<string, Set<string>>(keys.map((key) => [key, new Set<string>()]));
    retained(await warp.as('alice').execute([intent.node.add({ subject: 'doc' }), ...keys.map((key) => intent.property.set({ subject: 'doc', key, value: 'start' }))]));
    let plurals = 0;
    for (let round = 0; round < 4; round += 1) {
      for (const writer of ['bob', 'carol', 'dave']) {
        if (next() < 0.6) {
          const key = keys[Math.floor(next() * keys.length)] ?? 'title';
          await unseen(path, writer, (patch) => { patch.setProperty('doc', key, `${writer}-${String(round)}`); });
          unobserved.get(key)?.add(writer);
        }
      }
      const skipped = keys[Math.floor(next() * keys.length)] ?? 'tag';
      const written = keys.filter((key) => key !== skipped);
      const receipt = retained(await warp.as('alice').execute(written.map((key) => intent.property.set({ subject: 'doc', key, value: `alice-${String(round)}` }))));
      const expected = expectedRaces(unobserved, written);

      expect(receipt.outcome.races.map(wire)).toEqual(expected);
      expect(receipt.outcome.kind).toBe(expected.length === 0 ? 'derived' : 'plural');
      expect(await coreRaces(path, receipt)).toBe(canonicalStringify(expected));
      plurals += expected.length === 0 ? 0 : 1;
    }

    expect(plurals).toBeGreaterThan(0);
  });
});
