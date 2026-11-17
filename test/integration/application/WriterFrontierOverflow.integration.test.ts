import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import ContentAddressableStore from '@git-stunts/git-cas';
import Plumbing from '@git-stunts/plumbing';
import { intent } from '../../../advanced.ts';
import { GitStorage, RetainedWriteReceipt, UnpublishedWriteReceipt } from '../../../index.ts';
import type { WriteReceipt } from '../../../index.ts';
import { getDefaultRuntimeHostNodePorts } from '../../../src/application/RuntimeHostNodeDefaults.ts';
import { WARP_SUPPORT_LIMITS } from '../../../src/application/WarpWriteComposition.ts';
import { resolveConeWrites, resolveWarpStorage } from '../../../src/application/WarpStorageRegistry.ts';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import ConeBasis from '../../../src/domain/services/cone/ConeBasis.ts';
import ConeBasisHead from '../../../src/domain/services/cone/ConeBasisHead.ts';
import ConeLaneBasis from '../../../src/domain/services/cone/ConeLaneBasis.ts';
import NodeAdd from '../../../src/domain/types/ops/NodeAdd.ts';
import Patch from '../../../src/domain/types/Patch.ts';
import { buildWriterRef, buildWritersPrefix } from '../../../src/domain/utils/RefLayout.ts';
import { CborPatchJournalAdapter } from '../../../src/infrastructure/adapters/CborPatchJournalAdapter.ts';
import GitCasAssetStorageAdapter from '../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import GitConePatchFeedAdapter from '../../../src/infrastructure/adapters/GitConePatchFeedAdapter.ts';
import GitConeRecordStoreAdapter from '../../../src/infrastructure/adapters/GitConeRecordStoreAdapter.ts';
import GitTimelineHistoryAdapter from '../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import codec from '../../../src/infrastructure/codecs/CborCodec.ts';
import type ObservationCustodyPort from '../../../src/ports/ObservationCustodyPort.ts';
import type CallLatch from '../../helpers/CallLatch.ts';
import HeldObservationCustody from '../../helpers/HeldObservationCustody.ts';
import * as fixture from '../../helpers/WarpWriteFixture.ts';

/**
 * Every route by which a clone's writer frontier passes the writer limit (#1197, section 2),
 * on the production path with the production limits and real writer chains. The golden
 * promise is the same for every route and every mechanism: afterwards an existing writer
 * writes, and writes again through a Warp opened anew on the same repository.
 *
 * One seed repository holds `LIMIT - 1` real writer chains, every one folded by a write:
 * the existing writer's, and a pool written in bulk through the patch journal (one Warp
 * write each would cost a full custody retention per writer). Each route runs on its own
 * copy of the seed.
 */
const LIMIT = WARP_SUPPORT_LIMITS.writers;
const EXISTING = 'alice';
const POOL = Array.from({ length: LIMIT - 2 }, (_unused, index) => `pool-${String(index + 1).padStart(4, '0')}`);
const SEED_TIMEOUT_MS = 480_000;
const CASE_TIMEOUT_MS = 240_000;

const scratch: string[] = [];
let seed = '';

/** Appends one root patch for each writer straight to its chain, as another clone's writes arrive. */
async function appendChains(path: string, writers: readonly string[]): Promise<void> {
  const plumbing = await Plumbing.createDefault({ cwd: path });
  const history = new GitTimelineHistoryAdapter({ plumbing });
  try {
    const cas = ContentAddressableStore.createCbor({ plumbing, applicationRefPrefixes: ['refs/warp/'] });
    const journal = new CborPatchJournalAdapter({ assetStorage: new GitCasAssetStorageAdapter({ cas }), cas, codec, commitReader: history, graph: fixture.GRAPH });
    for (const writer of writers) {
      const patch = new Patch({ writer, lamport: 1, context: {}, ops: [new NodeAdd(`node-of-${writer}`, new Dot(writer, 1))] });
      await journal.appendPatch({ patch, graph: fixture.GRAPH, writer, targetRef: buildWriterRef(fixture.GRAPH, writer), expectedHead: null, parent: null, attachments: [] });
    }
  } finally {
    await history.close();
  }
}

async function copyOf(source: string): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), 'writer-frontier-overflow-'));
  scratch.push(target);
  await cp(source, target, { recursive: true });
  return target;
}

/** Each object's type in the repository at `path`, or `missing`. */
function objectTypes(path: string, oids: readonly string[]): readonly string[] {
  const listed = execFileSync('git', ['cat-file', '--batch-check=%(objecttype)'], { cwd: path, encoding: 'utf8', input: `${oids.join('\n')}\n` });
  return listed.trim().split('\n').map((line) => line.endsWith(' missing') ? 'missing' : line);
}

function writerChains(path: string): number {
  return fixture.git(path, ['for-each-ref', '--format=%(refname)', buildWritersPrefix(fixture.GRAPH)]).split('\n').filter((ref) => ref !== '').length;
}

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
      const store = new GitConeRecordStoreAdapter({ history: git.history, codec: ports.codec });
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

/** A receipt as one line: retained, or why it did not publish, or its kind. */
function outcome(receipt: WriteReceipt): string {
  if (receipt instanceof RetainedWriteReceipt) {
    return 'retained';
  }
  return receipt instanceof UnpublishedWriteReceipt ? `unpublished: ${receipt.cause}` : receipt.constructor.name;
}

/** The existing writer writes, then writes again through a Warp opened anew on the same repository. */
async function writesAcrossReopen(path: string): Promise<readonly string[]> {
  const before = await fixture.open(path);
  const first = outcome(await before.as(EXISTING).execute(intent.node.add({ subject: 'after-the-route' })));
  await before.close();
  const after = await fixture.open(path);
  const second = outcome(await after.as(EXISTING).execute(intent.node.add({ subject: 'after-the-reopen' })));
  await after.close();
  return [first, second];
}

/** The documented "Receive other writers" recipe, as `docs/topics/sync.md` prints it. */
async function receiveRecipe(): Promise<string> {
  const page = await readFile(new URL('../../../docs/topics/sync.md', import.meta.url), 'utf8');
  const section = page.slice(page.indexOf('## Receive other writers'));
  const start = section.indexOf('```bash\n') + '```bash\n'.length;
  return section.slice(start, section.indexOf('```', start));
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
  seed = await fixture.repository();
  const first = await fixture.openSwept(seed);
  fixture.retained(await first.as(EXISTING).execute(intent.node.add({ subject: 'seed' })));
  await first.close();
  await appendChains(seed, POOL);
  const folding = await fixture.open(seed);
  fixture.retained(await folding.as(EXISTING).execute(intent.node.add({ subject: 'pool-folded' })));
  await folding.close();
}, SEED_TIMEOUT_MS);

afterAll(async () => {
  await fixture.disposeWarpFixtures();
  await Promise.all(scratch.splice(0).map(async (path) => await rm(path, { recursive: true, force: true })));
});

it('seeds one writer chain fewer than the limit, every one folded', async () => {
  expect([writerChains(seed), await foldedWriters(seed)]).toEqual([LIMIT - 1, LIMIT - 1]);
}, CASE_TIMEOUT_MS);

describe('route 1: two first writes that both validate against 4,095 writers before either publishes (#1197)', () => {
  let path = '';
  let interleaving: Readonly<Record<string, string | number>> = {};

  beforeAll(async () => {
    path = await copyOf(seed);
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
      interleaving = { a, b, chainsWhileHeld: writerChains(path), publishedWhileHeld: [fixture.tip(path, 'newcomer-a'), fixture.tip(path, 'newcomer-b')].filter((tip) => tip !== null).length };
      latchA.release();
      latchB.release();
      await Promise.all([writeA, writeB]);
    } finally {
      latchA.release();
      latchB.release();
    }
    await Promise.all([one.close(), two.close()]);
  }, CASE_TIMEOUT_MS);

  it('holds both newcomers after they lowered against 4,095 writer chains, before either published', () => {
    expect(interleaving).toEqual({ a: 'held', b: 'held', chainsWhileHeld: LIMIT - 1, publishedWhileHeld: 0 });
  });

  it.fails('lets an existing writer write afterwards, and again after a reopen', async () => {
    expect(await writesAcrossReopen(path)).toEqual(['retained', 'retained']);
  }, CASE_TIMEOUT_MS);
});

describe('route 2: writer chains received through the documented git fetch recipe (#1197)', () => {
  const remote = ['remote-a', 'remote-b'];
  let path = '';
  let hubChains = 0;
  let received: readonly string[] = [];

  beforeAll(async () => {
    const hub = await mkdtemp(join(tmpdir(), 'writer-frontier-hub-'));
    scratch.push(hub);
    fixture.git(hub, ['init', '--bare', '--quiet']);
    const other = await copyOf(seed);
    await appendChains(other, remote);
    const lane = `refs/warp/${fixture.GRAPH}`;
    fixture.git(other, ['push', '--quiet', hub, `${lane}/writers/*:${lane}/writers/*`, `${lane}/substrate-version:${lane}/substrate-version`]);
    hubChains = writerChains(hub);
    path = await copyOf(seed);
    fixture.git(path, ['remote', 'add', 'origin', hub]);
    execFileSync('sh', ['-c', `LANE=${fixture.GRAPH}\nWRITER=${EXISTING}\n${await receiveRecipe()}`], { cwd: path, stdio: 'pipe' });
    const offered = remote.map((writer) => fixture.git(hub, ['rev-parse', buildWriterRef(fixture.GRAPH, writer)]));
    received = objectTypes(path, offered);
  }, CASE_TIMEOUT_MS);

  it('runs the recipe against a hub whose writer chains pass the limit, and receives the new chains', () => {
    expect([hubChains, ...received]).toEqual([LIMIT + 1, 'commit', 'commit']);
  });

  it.fails('lets an existing writer write afterwards, and again after a reopen', async () => {
    expect(await writesAcrossReopen(path)).toEqual(['retained', 'retained']);
  }, CASE_TIMEOUT_MS);
});

describe('route 3, not admitted: an oversized writer set in local refs that no basis has folded (#1197)', () => {
  let path = '';

  beforeAll(async () => {
    path = await copyOf(seed);
    await appendChains(path, ['stray-a', 'stray-b']);
  }, CASE_TIMEOUT_MS);

  it('holds 4,097 writer chains, of which the published basis has folded 4,095', async () => {
    expect([writerChains(path), await foldedWriters(path)]).toEqual([LIMIT + 1, LIMIT - 1]);
  }, CASE_TIMEOUT_MS);

  it.fails('lets an existing writer write afterwards, and again after a reopen', async () => {
    expect(await writesAcrossReopen(path)).toEqual(['retained', 'retained']);
  }, CASE_TIMEOUT_MS);
});

describe('route 3, already admitted: an oversized writer set the published basis has folded (#1197)', () => {
  let path = '';
  let newcomer = '';
  let advanced = 0;

  beforeAll(async () => {
    path = await copyOf(seed);
    const warp = await fixture.open(path);
    newcomer = outcome(await warp.as('newcomer-x').execute(intent.node.add({ subject: 'from-newcomer-x' })));
    await warp.close();
    await appendChains(path, ['stray-y']);
    advanced = await advancedWriters(path);
  }, CASE_TIMEOUT_MS);

  it('folds 4,097 writer chains into the published basis, one of them a newcomer whose write custody retained', async () => {
    expect([newcomer, advanced, await foldedWriters(path)]).toEqual(['retained', LIMIT + 1, LIMIT + 1]);
  }, CASE_TIMEOUT_MS);

  it.fails('lets an existing writer write afterwards, and again after a reopen', async () => {
    expect(await writesAcrossReopen(path)).toEqual(['retained', 'retained']);
  }, CASE_TIMEOUT_MS);
});
