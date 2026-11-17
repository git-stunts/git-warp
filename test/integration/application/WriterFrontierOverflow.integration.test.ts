import { execFileSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { intent } from '../../../advanced.ts';
import type { WriteReceipt } from '../../../index.ts';
import { WARP_WRITER_LIMIT } from '../../../src/application/WarpWriteComposition.ts';
import { encodeDot, Dot } from '../../../src/domain/crdt/Dot.ts';
import ConeBasis from '../../../src/domain/services/cone/ConeBasis.ts';
import ConeBasisHead from '../../../src/domain/services/cone/ConeBasisHead.ts';
import ConeLaneBasis from '../../../src/domain/services/cone/ConeLaneBasis.ts';
import ObservationCoordinate from '../../../src/domain/services/custody/ObservationCoordinate.ts';
import NodeRemove from '../../../src/domain/types/ops/NodeRemove.ts';
import { GitStorage, RetainedWriteReceipt } from '../../../index.ts';
import { getDefaultRuntimeHostNodePorts } from '../../../src/application/RuntimeHostNodeDefaults.ts';
import { resolveConeWrites, resolveWarpStorage } from '../../../src/application/WarpStorageRegistry.ts';
import { buildWriterRef } from '../../../src/domain/utils/RefLayout.ts';
import GitConePatchFeedAdapter from '../../../src/infrastructure/adapters/GitConePatchFeedAdapter.ts';
import GitConeRecordStoreAdapter from '../../../src/infrastructure/adapters/GitConeRecordStoreAdapter.ts';
import type ObservationCustodyPort from '../../../src/ports/ObservationCustodyPort.ts';
import type CallLatch from '../../helpers/CallLatch.ts';
import HeldObservationCustody from '../../helpers/HeldObservationCustody.ts';
import * as fixture from '../../helpers/WarpWriteFixture.ts';
import * as seeds from '../../helpers/WriterChainSeed.ts';

/**
 * Every route by which a clone's writer frontier passes the writer limit (#1197, section 2),
 * on the production path with the production limits and real writer chains. The golden
 * promise is the same for every route: afterwards an existing writer writes, and writes
 * again through a Warp opened anew on the same repository. Route 3 (already admitted) also
 * carries the section 2e evidence for frontier anchors: readings over the admitted history
 * do not change, no writer chain, dot, tombstone or receipt is lost, and a writer whose
 * head was folded writes again.
 *
 * One seed repository holds `LIMIT - 1` real writer chains, every one folded; each route
 * runs on its own copy.
 */
const LIMIT = WARP_WRITER_LIMIT;
const EXISTING = seeds.EXISTING_WRITER;
const POOL = seeds.poolOf(LIMIT - 2);
const SEED_TIMEOUT_MS = 480_000;
const CASE_TIMEOUT_MS = 240_000;
/** Removing the seed and its copies, thousands of objects each, outlasts the default hook timeout on a CI runner. */
const CLEANUP_TIMEOUT_MS = 120_000;

let seed = '';

/** Opens the lane's cone basis as the write path composes it, runs `read` on it, and releases it. */
async function withLaneBasis<T>(path: string, read: (basis: ConeLaneBasis, store: GitConeRecordStoreAdapter) => Promise<T>): Promise<T> {
  const storage = await GitStorage.open({ cwd: path });
  try {
    const ports = getDefaultRuntimeHostNodePorts();
    const git = resolveConeWrites(storage);
    const services = await resolveWarpStorage(storage).runtimeStorage.createRuntimeStorageServices({
      timelineName: fixture.GRAPH, codec: ports.codec, crypto: ports.crypto, commitMessageCodec: ports.commitMessageCodec,
    });
    try {
      const store = new GitConeRecordStoreAdapter({ history: git.history, codec: ports.codec, random: ports.random });
      const feed = new GitConePatchFeedAdapter({ history: git.history, journal: services.patchJournal, commitMessageCodec: ports.commitMessageCodec });
      return await read(ConeLaneBasis.ofLane({ lane: fixture.GRAPH, store, feed }), store);
    } finally {
      await services.materializations.close();
    }
  } finally {
    await storage.close();
  }
}

/** Writers in the lane's published basis frontier: what this clone has folded. */
async function foldedWriters(path: string): Promise<number> {
  return await withLaneBasis(path, async (_basis, store) => (await store.readBasis(ConeBasisHead.forLane(fixture.GRAPH)))?.basis.writerHeads().size ?? 0);
}

/** Advances and publishes the lane's basis over every writer chain the clone holds; its writer count, or -1 when obstructed. */
async function advancedWriters(path: string): Promise<number> {
  return await withLaneBasis(path, async (basis) => {
    const advanced = await basis.advance();
    return advanced instanceof ConeBasis ? advanced.writerHeads().size : -1;
  });
}

/** The existing writer writes, then writes again through a Warp opened anew on the same repository. */
async function writesAcrossReopen(path: string): Promise<readonly string[]> {
  return [
    await seeds.writeOnce(path, EXISTING, 'after-the-route'),
    await seeds.writeOnce(path, EXISTING, 'after-the-reopen'),
  ];
}

/** Each object's type in the repository at `path`, or `missing`. */
function objectTypes(path: string, oids: readonly string[]): readonly string[] {
  const listed = execFileSync('git', ['cat-file', '--batch-check=%(objecttype)'], { cwd: path, encoding: 'utf8', input: `${oids.join('\n')}\n` });
  return listed.trim().split('\n').map((line) => line.endsWith(' missing') ? 'missing' : line);
}

/** What custody answers today for the Coordinate a retained write's receipt bound. */
async function resolvedCoordinate(path: string, token: string): Promise<string> {
  const parsed = ObservationCoordinate.parse(token);
  if (!(parsed instanceof ObservationCoordinate)) {
    return 'unparsed';
  }
  const writes = await fixture.composed(path);
  try {
    return (await (await writes.openCustody()).resolve(parsed)).constructor.name;
  } finally {
    await writes.close();
  }
}

/** Wraps the custody a Warp opens, so the test can hold that Warp's next `prepare`. */
class CustodySlot {
  #held: HeldObservationCustody | null = null;

  readonly wrap = (custody: ObservationCustodyPort): ObservationCustodyPort => {
    this.#held = new HeldObservationCustody(custody);
    return this.#held;
  };

  holdPrepare(): CallLatch {
    if (this.#held === null) {
      throw new Error('This Warp has not opened custody yet');
    }
    return this.#held.hold('prepare', 'before');
  }
}

/** Where a newcomer's write stood once the test let the other one start: held at custody, or already settled. */
async function heldOrSettled(latch: CallLatch, write: Promise<WriteReceipt>): Promise<string> {
  return await Promise.race([latch.arrived().then(() => 'held'), write.then(() => 'settled')]);
}

beforeAll(async () => {
  seed = await seeds.seedRepository(POOL);
}, SEED_TIMEOUT_MS);

afterAll(async () => {
  await fixture.disposeWarpFixtures();
  await seeds.disposeWriterChainSeeds();
}, CLEANUP_TIMEOUT_MS);

it('seeds one writer chain fewer than the limit, every one folded', async () => {
  expect([seeds.writerChains(seed), await foldedWriters(seed)]).toEqual([LIMIT - 1, LIMIT - 1]);
}, CASE_TIMEOUT_MS);

describe('the edge: exactly 4,096 writer chains (#1197)', () => {
  let path = '';
  let admitted = '';

  beforeAll(async () => {
    path = await seeds.copyOf(seed);
    admitted = await seeds.writeOnce(path, 'newcomer-at-the-edge', 'from-the-edge');
  }, CASE_TIMEOUT_MS);

  it('admits the 4,096th writer and refuses the 4,097th with the newcomer repair', async () => {
    const refused = await seeds.writeOnce(path, 'newcomer-past-the-edge', 'refused');

    expect([admitted, refused, seeds.writerChains(path)]).toEqual(['retained', 'unpublished: writer-limit-reached', LIMIT]);
  }, CASE_TIMEOUT_MS);

  it('lets an existing writer write, and again after a reopen', async () => {
    expect(await writesAcrossReopen(path)).toEqual(['retained', 'retained']);
  }, CASE_TIMEOUT_MS);
});

describe('route 1: two first writes that both validate against 4,095 writers before either publishes (#1197)', () => {
  let path = '';
  let interleaving: Readonly<Record<string, string | number>> = {};
  let landed: { readonly receipts: readonly string[]; readonly chains: number } = { receipts: [], chains: 0 };

  beforeAll(async () => {
    path = await seeds.copyOf(seed);
    const slotA = new CustodySlot();
    const slotB = new CustodySlot();
    const one = await fixture.openSwept(path, { wrapCustody: slotA.wrap });
    const two = await fixture.openSwept(path, { wrapCustody: slotB.wrap });
    const latchA = slotA.holdPrepare();
    const latchB = slotB.holdPrepare();
    try {
      // Each newcomer lowers against the basis, then is held before custody prepares it, so before it publishes.
      const writeA = one.as('newcomer-a').execute(intent.node.add({ subject: 'from-newcomer-a' }));
      const a = await heldOrSettled(latchA, writeA);
      const writeB = two.as('newcomer-b').execute(intent.node.add({ subject: 'from-newcomer-b' }));
      const b = await heldOrSettled(latchB, writeB);
      interleaving = { a, b, chainsWhileHeld: seeds.writerChains(path), publishedWhileHeld: [fixture.tip(path, 'newcomer-a'), fixture.tip(path, 'newcomer-b')].filter((tip) => tip !== null).length };
      latchA.release();
      latchB.release();
      const receipts = await Promise.all([writeA, writeB]);
      landed = { receipts: receipts.map(seeds.outcome), chains: seeds.writerChains(path) };
    } finally {
      latchA.release();
      latchB.release();
    }
    await Promise.all([one.close(), two.close()]);
  }, CASE_TIMEOUT_MS);

  it('holds both newcomers after they lowered against 4,095 writer chains, before either published', () => {
    expect(interleaving).toEqual({ a: 'held', b: 'held', chainsWhileHeld: LIMIT - 1, publishedWhileHeld: 0 });
  });

  it('retains both newcomers\' writes, which take the clone to 4,097 writer chains', () => {
    expect(landed).toEqual({ receipts: ['retained', 'retained'], chains: LIMIT + 1 });
  });

  it('lets an existing writer write afterwards, and again after a reopen', async () => {
    expect(await writesAcrossReopen(path)).toEqual(['retained', 'retained']);
  }, CASE_TIMEOUT_MS);
});

describe('route 2: writer chains received through the documented git fetch recipe (#1197)', () => {
  const remote = ['remote-a', 'remote-b'];
  let path = '';
  let hubChains = 0;
  let received: readonly string[] = [];

  beforeAll(async () => {
    const other = await seeds.copyOf(seed);
    await seeds.appendChains(other, remote);
    const hub = await seeds.hubOf(other);
    hubChains = seeds.writerChains(hub);
    path = await seeds.copyOf(seed);
    fixture.git(path, ['remote', 'add', 'origin', hub]);
    execFileSync('sh', ['-c', `LANE=${fixture.GRAPH}\nWRITER=${EXISTING}\n${await seeds.syncRecipe('Receive other writers')}`], { cwd: path, stdio: 'pipe' });
    const offered = remote.map((writer) => fixture.git(hub, ['rev-parse', buildWriterRef(fixture.GRAPH, writer)]));
    received = objectTypes(path, offered);
  }, CASE_TIMEOUT_MS);

  it('runs the recipe against a hub whose writer chains pass the limit, and receives the new chains', () => {
    expect([hubChains, ...received]).toEqual([LIMIT + 1, 'commit', 'commit']);
  });

  it('lets an existing writer write afterwards, and again after a reopen', async () => {
    expect(await writesAcrossReopen(path)).toEqual(['retained', 'retained']);
  }, CASE_TIMEOUT_MS);
});

describe('the edge: a fetch that takes the clone past the limit while a write is in flight (#1197)', () => {
  let path = '';
  let held = '';
  let inFlight = '';

  beforeAll(async () => {
    const other = await seeds.copyOf(seed);
    await seeds.appendChains(other, ['remote-c', 'remote-d']);
    const hub = await seeds.hubOf(other);
    path = await seeds.copyOf(seed);
    fixture.git(path, ['remote', 'add', 'origin', hub]);
    const slot = new CustodySlot();
    const warp = await fixture.openSwept(path, { wrapCustody: slot.wrap });
    const latch = slot.holdPrepare();
    try {
      // The write has fixed its basis at 4,095 writer chains; the fetch lands before custody retains it.
      const writing = warp.as(EXISTING).execute(intent.node.add({ subject: 'during-the-fetch' }));
      held = await heldOrSettled(latch, writing);
      execFileSync('sh', ['-c', `LANE=${fixture.GRAPH}\nWRITER=${EXISTING}\n${await seeds.syncRecipe('Receive other writers')}`], { cwd: path, stdio: 'pipe' });
      latch.release();
      inFlight = seeds.outcome(await writing);
    } finally {
      latch.release();
    }
    await warp.close();
  }, CASE_TIMEOUT_MS);

  it('retains the write that was in flight, over the basis it fixed', () => {
    expect([held, inFlight, seeds.writerChains(path)]).toEqual(['held', 'retained', LIMIT + 1]);
  });

  it('lets an existing writer write afterwards, and again after a reopen', async () => {
    expect(await writesAcrossReopen(path)).toEqual(['retained', 'retained']);
  }, CASE_TIMEOUT_MS);
});

describe('route 3, not admitted: an oversized writer set in local refs that no basis has folded (#1197)', () => {
  let path = '';

  beforeAll(async () => {
    path = await seeds.copyOf(seed);
    await seeds.appendChains(path, ['stray-a', 'stray-b']);
  }, CASE_TIMEOUT_MS);

  it('holds 4,097 writer chains, of which the published basis has folded 4,095', async () => {
    expect([seeds.writerChains(path), await foldedWriters(path)]).toEqual([LIMIT + 1, LIMIT - 1]);
  }, CASE_TIMEOUT_MS);

  it('lets an existing writer write afterwards, and again after a reopen', async () => {
    expect(await writesAcrossReopen(path)).toEqual(['retained', 'retained']);
  }, CASE_TIMEOUT_MS);
});

describe('route 3, already admitted: an oversized writer set the published basis has folded (#1197)', () => {
  const tombstoned = POOL[0] ?? '';
  let path = '';
  let newcomer: RetainedWriteReceipt | null = null;
  let advanced = 0;
  let readingsBefore: { nodes: string[]; edges: string[] } = { nodes: [], edges: [] };
  let readingsAfter: { nodes: string[]; edges: string[] } = { nodes: [], edges: [] };
  let tipsBefore: readonly string[] = [];
  let golden: readonly string[] = [];

  beforeAll(async () => {
    path = await seeds.copyOf(seed);
    const warp = await fixture.open(path);
    newcomer = fixture.retained(await warp.as('newcomer-x').execute(intent.node.add({ subject: 'from-newcomer-x' })));
    await warp.close();
    // Another clone's writer removed a pool writer's node: its tombstone names that writer's dot.
    await seeds.appendChains(path, ['stray-y'], () => [new NodeRemove(seeds.nodeOf(tombstoned), [encodeDot(new Dot(tombstoned, 1))])]);
    advanced = await advancedWriters(path);
    readingsBefore = await fixture.materialized(path);
    tipsBefore = seeds.writerTips(path);
    golden = await writesAcrossReopen(path);
    readingsAfter = await fixture.materialized(path);
  }, SEED_TIMEOUT_MS);

  it('folds 4,097 writer chains into the published basis, one of them a newcomer whose write custody retained', () => {
    expect([newcomer?.writer, advanced]).toEqual(['newcomer-x', LIMIT + 1]);
  });

  it('lets an existing writer write afterwards, and again after a reopen', () => {
    expect(golden).toEqual(['retained', 'retained']);
  });

  it('keeps every reading over the admitted history, adding only the two new writes', () => {
    const added = readingsAfter.nodes.filter((node) => !readingsBefore.nodes.includes(node));

    expect(readingsBefore.nodes.filter((node) => !readingsAfter.nodes.includes(node))).toEqual([]);
    expect(added).toHaveLength(2);
    expect(readingsAfter.edges).toEqual(readingsBefore.edges);
  });

  it('keeps every pool writer\'s dot and the tombstone that removes one of them', () => {
    const poolNodes = readingsAfter.nodes.filter((node) => node.startsWith(seeds.nodeOf('pool-')));

    expect(poolNodes).toHaveLength(POOL.length - 1);
    expect(readingsAfter.nodes).not.toContain(seeds.nodeOf(tombstoned));
    expect(readingsAfter.nodes).toContain(seeds.nodeOf('stray-y'));
  });

  it('rewrites no writer chain: only the existing writer\'s advances, and fast-forward', () => {
    const after = seeds.writerTips(path);
    const moved = tipsBefore.filter((line) => !after.includes(line));
    const [ref = '', tip = ''] = (moved[0] ?? '').split(' ');

    expect(moved.map((line) => line.split(' ')[0])).toEqual([buildWriterRef(fixture.GRAPH, EXISTING)]);
    expect(fixture.git(path, ['merge-base', '--is-ancestor', tip, ref]).length).toBe(0);
  });

  it('still resolves the Coordinate that the newcomer\'s retained receipt bound', async () => {
    expect(await resolvedCoordinate(path, newcomer?.coordinate.toString() ?? '')).toBe('ResolvedObservation');
  }, CASE_TIMEOUT_MS);

  it('lets a writer whose head was folded and anchored write again', async () => {
    expect(await seeds.writeOnce(path, POOL[1] ?? '', 'from-a-folded-writer')).toBe('retained');
  }, CASE_TIMEOUT_MS);
});
