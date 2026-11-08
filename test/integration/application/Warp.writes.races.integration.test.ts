import { afterEach, describe, expect, it, vi } from 'vitest';
import { intent } from '../../../advanced.ts';
import { GitStorage, UnretainedWriteReceipt, WarpAddress, type RetainedWriteReceipt } from '../../../index.ts';
import { getDefaultRuntimeHostNodePorts } from '../../../src/application/RuntimeHostNodeDefaults.ts';
import { resolveWarpStorage } from '../../../src/application/WarpStorageRegistry.ts';
import { composeWarpWrites } from '../../../src/application/WarpWriteComposition.ts';
import type WriteRace from '../../../src/domain/api/WriteRace.ts';
import CustodyIndeterminate from '../../../src/domain/services/custody/CustodyIndeterminate.ts';
import ObservationCoordinate from '../../../src/domain/services/custody/ObservationCoordinate.ts';
import ObservationReceiptCore from '../../../src/domain/services/custody/ObservationReceiptCore.ts';
import ResolvedObservation from '../../../src/domain/services/custody/ResolvedObservation.ts';
import { textDecode } from '../../../src/domain/utils/bytes.ts';
import { openRuntimeHostProduct, type RuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';
import ObservationCustodyCborCodec from '../../../src/infrastructure/adapters/ObservationCustodyCborCodec.ts';
import codec from '../../../src/infrastructure/codecs/CborCodec.ts';
import type ObservationCustodyPort from '../../../src/ports/ObservationCustodyPort.ts';
import { GRAPH, TestAccess, attemptRefs, disposeWarpFixtures, open, repository, retained } from '../../helpers/WarpWriteFixture.ts';

afterEach(async () => {
  vi.restoreAllMocks();
  await disposeWarpFixtures();
});

type Patch = Parameters<Parameters<RuntimeHostProduct['patch']>[0]>[0];

/** A write by another writer this Warp never observed, through the legacy patch path, which records no causality. */
async function unseen(path: string, writer: string, build: (patch: Patch) => void): Promise<void> {
  const storage = await GitStorage.open({ cwd: path });
  try {
    const ports = getDefaultRuntimeHostNodePorts();
    const binding = resolveWarpStorage(storage);
    const product = await openRuntimeHostProduct({
      persistence: binding.history, runtimeStorage: binding.runtimeStorage, graphName: GRAPH, writerId: writer,
      codec: ports.codec, crypto: ports.crypto, trustCrypto: ports.trustCrypto, commitMessageCodec: ports.commitMessageCodec,
    });
    await product.materialize();
    await product.patch(build);
  } finally {
    await storage.close();
  }
}

function wire(race: WriteRace): object {
  const { kind, subject, key, writers, overflow, causality } = race;
  return { kind, subject, key, writers: [...writers], overflow, causality };
}

/** The races bound in a retained receipt's canonical core, read back from custody. */
async function coreRaces(path: string, receipt: RetainedWriteReceipt): Promise<unknown> {
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
    const outcome: { readonly races?: unknown } = JSON.parse(textDecode(core.outcome()));
    return outcome.races;
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
    expect(await coreRaces(path, raced)).toEqual([BOB_TITLE]);
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
    expect(await coreRaces(path, rebuilt)).toEqual([BOB_TITLE]);
    expect(attemptRefs(path)).toEqual([]);
  });

  it('binds an empty race list for a derived write', async () => {
    const path = await repository();
    const warp = await open(path);

    const derived = retained(await warp.as('alice').execute(intent.node.add({ subject: 'doc' })));

    expect(derived.outcome.kind).toBe('derived');
    expect(await coreRaces(path, derived)).toEqual([]);
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
    expect(await coreRaces(path, raced)).toEqual(expected);
  });

  it('keeps a node lifecycle race apart from a property register race', async () => {
    const path = await repository();
    const warp = await open(path);
    retained(await warp.as('alice').execute([intent.node.add({ subject: 'doc' }), intent.property.set({ subject: 'doc', key: 'title', value: 'one' })]));
    await unseen(path, 'bob', (patch) => { patch.removeNode('doc'); });
    await unseen(path, 'carol', (patch) => { patch.setProperty('doc', 'title', 'carols'); });

    const raced = retained(await warp.as('alice').execute(intent.property.set({ subject: 'doc', key: 'title', value: 'two' })));

    expect(raced.outcome.races.map(wire)).toEqual([BOB_REMOVED, CAROL_TITLE]);
    expect(await coreRaces(path, raced)).toEqual([BOB_REMOVED, CAROL_TITLE]);
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
      expect(await coreRaces(path, receipt)).toEqual(expected);
      plurals += expected.length === 0 ? 0 : 1;
    }

    expect(plurals).toBeGreaterThan(0);
  });
});
