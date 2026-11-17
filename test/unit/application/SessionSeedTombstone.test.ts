/**
 * #1153 witness: a Git-storage host applies a sync response that holds a
 * remove but not the add it observed. Sync uses the plain reducer, so the
 * cached state holds a tombstone that no node entry holds. The host then
 * checkpoints, and the add arrives later by a ref fetch. A materialize that
 * resumes from the checkpoint seeds a reducer session from the checkpoint
 * state, and the seeding copies entries only (`seedSessionWithORSet`), so
 * the tombstone is lost and the node comes back.
 *
 * The cases marked `it.fails` assert the correct behavior and fail until
 * #1153 is fixed; Vitest reports an unexpected pass as a failure.
 *
 * Shape: `origin` holds zed's adds and abe's remove of n1. `peer` holds a
 * subset of origin's writer refs. `replica` (writer bea) syncs with `peer`,
 * checkpoints, then fetches zed's writer ref from `origin`.
 *
 * Oracle: the in-memory reducer over the same patches (first case), which
 * keeps a tombstone whose add has not arrived.
 */

import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { Dot, encodeDot } from '../../../src/domain/crdt/Dot.ts';
import { reducePatches } from '../../../src/domain/services/JoinReducer.ts';
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
const SCENARIO_TIMEOUT = { timeout: 120_000 };

type Membership = {
  readonly n1Alive: boolean;
  readonly tombstones: readonly string[];
  readonly entryDots: readonly string[];
};

type Seen = {
  readonly applied: number;
  readonly writersAfterSync: readonly string[];
  readonly afterSync: Membership;
  readonly storedCheckpointState: Membership;
  readonly freshAfterCheckpoint: Membership;
  readonly sameHostAfterAddArrives: Membership;
  readonly freshAfterAddArrives: Membership;
};

/** n1 removed, with the tombstone, once every patch has arrived. */
const REMOVED: Membership = { n1Alive: false, tombstones: [ZED_1], entryDots: ['bea:1', ZED_1, 'zed:2'] };
/** n1 removed by a tombstone whose add has not arrived. */
const REMOVED_BEFORE_ADD: Membership = { n1Alive: false, tombstones: [ZED_1], entryDots: ['bea:1'] };

function membershipOf(state: WarpState): Membership {
  return {
    n1Alive: state.nodeAlive.contains('n1'),
    tombstones: [...state.nodeAlive.tombstonesIter()].sort(),
    entryDots: [...state.nodeAlive.entryDotsIter()].sort(),
  };
}

function cachedMembership(host: GitStorageHost): Membership {
  const state = host._cachedState;
  if (state === null) { throw new Error('the host has no cached state'); }
  return membershipOf(state);
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

async function freshMembership(replica: string): Promise<Membership> {
  return await withHost(replica, 'reader', async (fresh) => {
    await fresh.materialize();
    return cachedMembership(fresh);
  });
}

async function storedCheckpointMembership(replica: string): Promise<Membership> {
  return await withHost(replica, 'reader', async (fresh) => {
    const checkpoint = await fresh._loadLatestCheckpoint();
    if (checkpoint === null) { throw new Error('no checkpoint was stored'); }
    return membershipOf(checkpoint.state);
  });
}

async function writeOrigin(origin: string): Promise<void> {
  await withHost(origin, 'zed', async (h) => { await (await h.createPatch()).addNode('n1').addNode('n2').commit(); });
  await withHost(origin, 'abe', async (h) => { await h.materialize(); await (await h.createPatch()).removeNode('n1').commit(); });
}

/** Runs the scenario; `peerWriters` are the origin writer refs the sync peer holds. */
async function run(peerWriters: readonly string[]): Promise<Seen> {
  return await inGitRepo('session-seed-origin', async (origin) => await inGitRepo('session-seed-peer', async (peer) =>
    await inGitRepo('session-seed-replica', async (replica) => {
      await writeOrigin(origin);
      await withHost(peer, 'init', async () => { /* writes the substrate marker */ });
      peerWriters.forEach((writer) => fetchWriter(peer, origin, writer));
      await withHost(replica, 'bea', async (h) => { await (await h.createPatch()).addNode('x').commit(); });
      const seen = await withHost(replica, 'bea', async (bea) => {
        await bea.materialize();
        const synced = await withHost(peer, 'peer-reader', async (peerHost) =>
          await bea._syncController.syncWith(peerHost._syncController));
        const afterSync = cachedMembership(bea);
        const writersAfterSync = localWriters(replica);
        await bea.createCheckpoint();
        const storedCheckpointState = await storedCheckpointMembership(replica);
        const freshAfterCheckpoint = await freshMembership(replica);
        fetchWriter(replica, origin, 'zed');
        await bea.materialize();
        return {
          applied: synced.applied, writersAfterSync, afterSync, storedCheckpointState, freshAfterCheckpoint,
          sameHostAfterAddArrives: cachedMembership(bea),
        };
      });
      return { ...seen, freshAfterAddArrives: await freshMembership(replica) };
    })));
}

describe('a session seeded from a checkpoint state on Git storage (#1153)', () => {
  it('oracle: the plain reducer removes n1 when the remove comes before the add', () => {
    const patches = [
      new Patch({ writer: 'bea', lamport: 1, context: {}, ops: [new NodeAdd('x', new Dot('bea', 1))] }),
      new Patch({ writer: 'abe', lamport: 2, context: { zed: 2 }, ops: [new NodeRemove('n1', [ZED_1])] }),
      new Patch({ writer: 'zed', lamport: 1, context: {}, ops: [new NodeAdd('n1', new Dot('zed', 1)), new NodeAdd('n2', new Dot('zed', 2))] }),
    ].map((patch, index) => ({ patch, sha: String(index + 1).repeat(40) }));

    expect(membershipOf(reducePatches(patches))).toEqual(REMOVED);
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

  it.fails('keeps that tombstone in a host that resumes from the checkpoint (#1153)', SCENARIO_TIMEOUT, async () => {
    const seen = await run(['abe']);

    expect(seen.freshAfterCheckpoint).toEqual(REMOVED_BEFORE_ADD);
  });

  it.fails('keeps n1 removed when the add arrives after the checkpoint (#1153)', SCENARIO_TIMEOUT, async () => {
    const seen = await run(['abe']);

    expect({ sameHost: seen.sameHostAfterAddArrives, fresh: seen.freshAfterAddArrives })
      .toEqual({ sameHost: REMOVED, fresh: REMOVED });
  });
});
