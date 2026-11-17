/**
 * #1153 witness: a Git-storage host applies a sync response that holds a
 * remove but not the add it observed. Sync uses the plain reducer, so the
 * cached state holds a tombstone that no node entry holds. The host then
 * checkpoints, and the add arrives later by a ref fetch. A materialize that
 * resumes from the checkpoint starts a reducer session from the checkpoint
 * state. Before #1153 was fixed, the session copied entries only
 * (`seedSessionWithORSet`), so the tombstone was lost and the node came
 * back. The reducer frame now keeps such tombstones beside its session.
 *
 * Shape: `origin` holds zed's adds and abe's remove of n1 (or of the edge
 * n1 -> n2). `peer` holds a subset of origin's writer refs. `replica`
 * (writer bea) syncs with `peer`, checkpoints, then fetches zed's writer
 * ref from `origin`.
 *
 * Oracle: the in-memory reducer over the same patches (first case), which
 * keeps a tombstone whose add has not arrived.
 */

import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { Dot, encodeDot } from '../../../src/domain/crdt/Dot.ts';
import type ORSet from '../../../src/domain/crdt/ORSet.ts';
import { encodeEdgeKey, reducePatches } from '../../../src/domain/services/JoinReducer.ts';
import type WarpState from '../../../src/domain/services/state/WarpState.ts';
import Patch from '../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../src/domain/types/ops/NodeRemove.ts';
import {
  inGitRepo,
  JOURNAL_GRAPH,
  withGitStorageHost as withHost,
  type GitStorageHost,
} from '../../helpers/GitStorageJournalFixture.ts';

const ZED_1 = encodeDot(new Dot('zed', 1));
const ZED_3 = encodeDot(new Dot('zed', 3));
const EDGE = encodeEdgeKey('n1', 'n2', 'rel');
const SCENARIO_TIMEOUT = { timeout: 120_000 };

/** What abe removes at the origin: the node n1, or the edge n1 -> n2. */
type Removed = 'node' | 'edge';

type Membership = {
  readonly alive: boolean;
  readonly tombstones: readonly string[];
  readonly entryDots: readonly string[];
};

type Seen = {
  readonly applied: number;
  readonly writersAfterSync: readonly string[];
  readonly afterSync: Membership;
  readonly storedCheckpointState: Membership;
  readonly freshAfterCheckpoint: Membership;
  readonly boundedAfterAddArrives: { readonly alive: boolean; readonly kind: string };
  readonly sameHostAfterAddArrives: Membership;
  readonly sameHostHasN1: boolean;
  readonly freshAfterAddArrives: Membership;
  readonly freshHasN1: boolean;
};

/** n1 removed, with the tombstone, once every patch has arrived. */
const REMOVED: Membership = { alive: false, tombstones: [ZED_1], entryDots: ['bea:1', ZED_1, 'zed:2'] };
/** n1 removed by a tombstone whose add has not arrived. */
const REMOVED_BEFORE_ADD: Membership = { alive: false, tombstones: [ZED_1], entryDots: ['bea:1'] };
/** The edge removed, with the tombstone, once every patch has arrived. */
const EDGE_REMOVED: Membership = { alive: false, tombstones: [ZED_3], entryDots: [ZED_3] };
/** The edge removed by a tombstone whose add has not arrived. */
const EDGE_REMOVED_BEFORE_ADD: Membership = { alive: false, tombstones: [ZED_3], entryDots: [] };

function orsetMembership(set: ORSet, element: string): Membership {
  return {
    alive: set.contains(element),
    tombstones: [...set.tombstonesIter()].sort(),
    entryDots: [...set.entryDotsIter()].sort(),
  };
}

function membershipOf(state: WarpState, removed: Removed): Membership {
  return removed === 'node' ? orsetMembership(state.nodeAlive, 'n1') : orsetMembership(state.edgeAlive, EDGE);
}

function cachedMembership(host: GitStorageHost, removed: Removed): Membership {
  const state = host._cachedState;
  if (state === null) { throw new Error('the host has no cached state'); }
  return membershipOf(state, removed);
}

function fetchWriter(into: string, from: string, writer: string): void {
  const ref = `refs/warp/${JOURNAL_GRAPH}/writers/${writer}`;
  execFileSync('git', ['-C', into, 'fetch', from, `${ref}:${ref}`], { stdio: 'pipe' });
}

function localWriters(cwd: string): readonly string[] {
  const prefix = `refs/warp/${JOURNAL_GRAPH}/writers/`;
  return execFileSync('git', ['-C', cwd, 'for-each-ref', '--format=%(refname)', prefix], { encoding: 'utf8' })
    .split('\n').filter((line) => line.length > 0).map((line) => line.slice(prefix.length)).sort();
}

async function freshMembership(replica: string, removed: Removed): Promise<{ membership: Membership; hasN1: boolean }> {
  return await withHost(replica, 'reader', async (fresh) => {
    await fresh.materialize();
    return { membership: cachedMembership(fresh, removed), hasN1: await fresh.hasNode('n1') };
  });
}

/** The bounded checkpoint-tail read of n1 on a fresh host, before any materialize. */
async function boundedRead(replica: string): Promise<{ alive: boolean; kind: string }> {
  return await withHost(replica, 'reader', async (fresh) => {
    const node = await fresh.worldline().optic().node('n1').read();
    return { alive: node.alive, kind: node.readIdentity.kind };
  });
}

async function storedCheckpointMembership(replica: string, removed: Removed): Promise<Membership> {
  return await withHost(replica, 'reader', async (fresh) => {
    const checkpoint = await fresh._loadLatestCheckpoint();
    if (checkpoint === null) { throw new Error('no checkpoint was stored'); }
    return membershipOf(checkpoint.state, removed);
  });
}

async function writeOrigin(origin: string, removed: Removed): Promise<void> {
  if (removed === 'node') {
    await withHost(origin, 'zed', async (h) => { await (await h.createPatch()).addNode('n1').addNode('n2').commit(); });
    await withHost(origin, 'abe', async (h) => { await h.materialize(); await (await h.createPatch()).removeNode('n1').commit(); });
    return;
  }
  await withHost(origin, 'zed', async (h) => {
    await (await h.createPatch()).addNode('n1').addNode('n2').addEdge('n1', 'n2', 'rel').commit();
  });
  await withHost(origin, 'abe', async (h) => { await h.materialize(); await (await h.createPatch()).removeEdge('n1', 'n2', 'rel').commit(); });
}

/** Runs the scenario; `peerWriters` are the origin writer refs the sync peer holds. */
async function run(peerWriters: readonly string[], removed: Removed = 'node'): Promise<Seen> {
  return await inGitRepo('session-seed-origin', async (origin) => await inGitRepo('session-seed-peer', async (peer) =>
    await inGitRepo('session-seed-replica', async (replica) => {
      await writeOrigin(origin, removed);
      await withHost(peer, 'init', async () => { /* writes the substrate marker */ });
      peerWriters.forEach((writer) => fetchWriter(peer, origin, writer));
      await withHost(replica, 'bea', async (h) => { await (await h.createPatch()).addNode('x').commit(); });
      const seen = await withHost(replica, 'bea', async (bea) => {
        await bea.materialize();
        const synced = await withHost(peer, 'peer-reader', async (peerHost) =>
          await bea._syncController.syncWith(peerHost._syncController));
        const afterSync = cachedMembership(bea, removed);
        const writersAfterSync = localWriters(replica);
        await bea.createCheckpoint();
        const storedCheckpointState = await storedCheckpointMembership(replica, removed);
        const freshAfterCheckpoint = (await freshMembership(replica, removed)).membership;
        fetchWriter(replica, origin, 'zed');
        const boundedAfterAddArrives = await boundedRead(replica);
        await bea.materialize();
        return {
          applied: synced.applied, writersAfterSync, afterSync, storedCheckpointState, freshAfterCheckpoint,
          boundedAfterAddArrives,
          sameHostAfterAddArrives: cachedMembership(bea, removed),
          sameHostHasN1: await bea.hasNode('n1'),
        };
      });
      const fresh = await freshMembership(replica, removed);
      return { ...seen, freshAfterAddArrives: fresh.membership, freshHasN1: fresh.hasN1 };
    })));
}

describe('a session seeded from a checkpoint state on Git storage (#1153)', () => {
  it('oracle: the plain reducer removes n1 when the remove comes before the add', () => {
    const patches = [
      new Patch({ writer: 'bea', lamport: 1, context: {}, ops: [new NodeAdd('x', new Dot('bea', 1))] }),
      new Patch({ writer: 'abe', lamport: 2, context: { zed: 2 }, ops: [new NodeRemove('n1', [ZED_1])] }),
      new Patch({ writer: 'zed', lamport: 1, context: {}, ops: [new NodeAdd('n1', new Dot('zed', 1)), new NodeAdd('n2', new Dot('zed', 2))] }),
    ].map((patch, index) => ({ patch, sha: String(index + 1).repeat(40) }));

    expect(membershipOf(reducePatches(patches), 'node')).toEqual(REMOVED);
  });

  it('keeps n1 removed when the sync delivers the add with the remove', SCENARIO_TIMEOUT, async () => {
    const seen = await run(['abe', 'zed']);

    expect({ applied: seen.applied, sameHost: seen.sameHostAfterAddArrives, fresh: seen.freshAfterAddArrives })
      .toEqual({ applied: 2, sameHost: REMOVED, fresh: REMOVED });
  });

  it('stores the tombstone in the checkpoint when the sync delivers only the remove', SCENARIO_TIMEOUT, async () => {
    const seen = await run(['abe']);

    expect({
      applied: seen.applied,
      writersAfterSync: seen.writersAfterSync,
      afterSync: seen.afterSync,
      storedCheckpointState: seen.storedCheckpointState,
    }).toEqual({
      applied: 1,
      writersAfterSync: ['bea'],
      afterSync: REMOVED_BEFORE_ADD,
      storedCheckpointState: REMOVED_BEFORE_ADD,
    });
  });

  it('keeps that tombstone in a host that resumes from the checkpoint (#1153)', SCENARIO_TIMEOUT, async () => {
    const seen = await run(['abe']);

    expect(seen.freshAfterCheckpoint).toEqual(REMOVED_BEFORE_ADD);
  });

  it('keeps n1 removed when the add arrives after the checkpoint (#1153)', SCENARIO_TIMEOUT, async () => {
    const seen = await run(['abe']);

    expect({ sameHost: seen.sameHostAfterAddArrives, fresh: seen.freshAfterAddArrives })
      .toEqual({ sameHost: REMOVED, fresh: REMOVED });
  });

  it('answers n1 removed on every read once the add arrives after the checkpoint (#1153)', SCENARIO_TIMEOUT, async () => {
    const seen = await run(['abe']);

    expect({ bounded: seen.boundedAfterAddArrives, sameHostHasN1: seen.sameHostHasN1, freshHasN1: seen.freshHasN1 })
      .toEqual({ bounded: { alive: false, kind: 'checkpoint-tail-read' }, sameHostHasN1: false, freshHasN1: false });
  });
});

describe('a session seeded from a checkpoint state on Git storage: edge variant (#1153)', () => {
  it('stores the edge tombstone in the checkpoint when the sync delivers only the remove', SCENARIO_TIMEOUT, async () => {
    const seen = await run(['abe'], 'edge');

    expect({ afterSync: seen.afterSync, storedCheckpointState: seen.storedCheckpointState })
      .toEqual({ afterSync: EDGE_REMOVED_BEFORE_ADD, storedCheckpointState: EDGE_REMOVED_BEFORE_ADD });
  });

  it('keeps the edge tombstone in a host that resumes from the checkpoint', SCENARIO_TIMEOUT, async () => {
    const seen = await run(['abe'], 'edge');

    expect(seen.freshAfterCheckpoint).toEqual(EDGE_REMOVED_BEFORE_ADD);
  });

  it('keeps the edge removed when the add arrives after the checkpoint', SCENARIO_TIMEOUT, async () => {
    const seen = await run(['abe'], 'edge');

    expect({ sameHost: seen.sameHostAfterAddArrives, fresh: seen.freshAfterAddArrives })
      .toEqual({ sameHost: EDGE_REMOVED, fresh: EDGE_REMOVED });
  });

  it('keeps the edge removed when the sync delivers the add with the remove', SCENARIO_TIMEOUT, async () => {
    const seen = await run(['abe', 'zed'], 'edge');

    expect({ sameHost: seen.sameHostAfterAddArrives, fresh: seen.freshAfterAddArrives })
      .toEqual({ sameHost: EDGE_REMOVED, fresh: EDGE_REMOVED });
  });
});

// ── Recovery of a state that an earlier version stored (Safety Review F3) ────

/** The operator steps under test: the #1119 procedure, or fetching every writer ref. */
type Recovery = 'delete-checkpoint-and-cache-refs' | 'fetch-writer-refs';

type RecoverySeen = {
  readonly staleAlive: boolean;
  readonly recoveredAlive: boolean;
  readonly recoveredHasN1: boolean;
  readonly recheckpointed: Membership;
};

function gitRun(cwd: string, args: readonly string[]): void {
  execFileSync('git', ['-C', cwd, ...args], { stdio: 'pipe' });
}

/**
 * An earlier version seeded a session from the sync checkpoint without its
 * floating tombstone, so once the add arrived it stored a state (a retained
 * materialization and a checkpoint) in which the element is alive again.
 * This fixture stores that state through the current code: it drops the
 * tombstone from the materialized state and checkpoints that state.
 */
async function storeStaleState(bea: GitStorageHost, removed: Removed): Promise<void> {
  const current = bea._cachedState;
  if (current === null) { throw new Error('the host has no cached state'); }
  const stale = current.clone();
  (removed === 'node' ? stale.nodeAlive : stale.edgeAlive).tombstones.delete(removed === 'node' ? ZED_1 : ZED_3);
  bea._cachedState = stale;
  await bea.createCheckpoint();
}

async function aliveOnFreshHost(replica: string, removed: Removed): Promise<boolean> {
  return (await freshMembership(replica, removed)).membership.alive;
}

/** Stores the stale state, closes every host, runs `recovery`, then reads on a fresh host. */
async function recoverStaleState(removed: Removed, recovery: Recovery): Promise<RecoverySeen> {
  return await inGitRepo('session-seed-origin', async (origin) => await inGitRepo('session-seed-peer', async (peer) =>
    await inGitRepo('session-seed-replica', async (replica) => {
      await writeOrigin(origin, removed);
      await withHost(peer, 'init', async () => { /* writes the substrate marker */ });
      fetchWriter(peer, origin, 'abe');
      await withHost(replica, 'bea', async (h) => { await (await h.createPatch()).addNode('x').commit(); });
      await withHost(replica, 'bea', async (bea) => {
        await bea.materialize();
        await withHost(peer, 'peer-reader', async (peerHost) => await bea._syncController.syncWith(peerHost._syncController));
        await bea.createCheckpoint();
        fetchWriter(replica, origin, 'zed');
        await bea.materialize();
        await storeStaleState(bea, removed);
      });
      const staleAlive = await aliveOnFreshHost(replica, removed);
      if (recovery === 'delete-checkpoint-and-cache-refs') {
        gitRun(replica, ['update-ref', '-d', `refs/warp/${JOURNAL_GRAPH}/checkpoints/head`]);
        gitRun(replica, ['update-ref', '-d', 'refs/cas/caches/git-warp/materializations']);
      } else {
        gitRun(replica, ['fetch', origin, `refs/warp/${JOURNAL_GRAPH}/writers/*:refs/warp/${JOURNAL_GRAPH}/writers/*`]);
      }
      const recovered = await withHost(replica, 'reader', async (reader) => {
        await reader.materialize();
        const seen = { alive: cachedMembership(reader, removed).alive, hasN1: await reader.hasNode('n1') };
        await reader.createCheckpoint();
        return seen;
      });
      return {
        staleAlive,
        recoveredAlive: recovered.alive,
        recoveredHasN1: recovered.hasN1,
        recheckpointed: await storedCheckpointMembership(replica, removed),
      };
    })));
}

describe('recovering a state that an earlier version stored without the tombstone (#1153)', () => {
  it('recovers n1 removed when the remover writer ref is fetched, without deleting any ref', SCENARIO_TIMEOUT, async () => {
    const seen = await recoverStaleState('node', 'fetch-writer-refs');

    expect(seen).toEqual({ staleAlive: true, recoveredAlive: false, recoveredHasN1: false, recheckpointed: REMOVED });
  });

  it('recovers the edge removed when the remover writer ref is fetched, without deleting any ref', SCENARIO_TIMEOUT, async () => {
    const seen = await recoverStaleState('edge', 'fetch-writer-refs');

    expect({ staleAlive: seen.staleAlive, recoveredAlive: seen.recoveredAlive, recheckpointed: seen.recheckpointed })
      .toEqual({ staleAlive: true, recoveredAlive: false, recheckpointed: EDGE_REMOVED });
  });

  it('does not recover n1 with the #1119 procedure, because the remove came only through sync', SCENARIO_TIMEOUT, async () => {
    // Characterization of the documented caveat: deleting the checkpoint and
    // cache refs discards the only local copy of a sync-only remove.
    const seen = await recoverStaleState('node', 'delete-checkpoint-and-cache-refs');

    expect({ staleAlive: seen.staleAlive, recoveredAlive: seen.recoveredAlive, recoveredHasN1: seen.recoveredHasN1 })
      .toEqual({ staleAlive: true, recoveredAlive: true, recoveredHasN1: true });
  });
});
