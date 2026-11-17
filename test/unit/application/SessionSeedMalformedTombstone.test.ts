/**
 * #1153 (Safety Review F1 of PR #1211): a sync peer can deliver a remove
 * whose observed dot is not a canonical dot. A remove checks only that each
 * observed dot is a non-empty string, and the in-memory reducer that sync
 * uses stores the string as a tombstone that no entry holds. With a
 * user-supplied state cache, `createCheckpoint` stores that state as a
 * snapshot, and a later `materialize()` starts a reducer session from it.
 * No add can carry such a string, so the session must skip it, as the
 * session trie already does, and the materialize must succeed.
 *
 * Oracle: the in-memory reducer over the same patches gives the nodes
 * `x` and `y`; the malformed remove changes no membership.
 */

import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import GitStorage from '../../../src/application/GitStorage.ts';
import { getDefaultRuntimeHostNodePorts } from '../../../src/application/RuntimeHostNodeDefaults.ts';
import { resolveWarpStorage } from '../../../src/application/WarpStorageRegistry.ts';
import { openRuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';
import Patch from '../../../src/domain/types/Patch.ts';
import NodeRemove from '../../../src/domain/types/ops/NodeRemove.ts';
import WarpStateCachePort, {
  type WarpStateCoordinate,
  type WarpStateSnapshotRecord,
} from '../../../src/ports/WarpStateCachePort.ts';
import { inGitRepo, JOURNAL_GRAPH } from '../../helpers/GitStorageJournalFixture.ts';

const SCENARIO_TIMEOUT = { timeout: 120_000 };
const PEER_SHA = 'a'.repeat(40);

function sameCoordinate(left: WarpStateCoordinate, right: WarpStateCoordinate): boolean {
  return left.ceiling === right.ceiling
    && left.frontier.size === right.frontier.size
    && [...left.frontier].every(([writer, tip]) => right.frontier.get(writer) === tip);
}

/** A state cache that keeps snapshots in memory and counts the exact hits it serves. */
class SnapshotCache extends WarpStateCachePort {
  readonly #snapshots: WarpStateSnapshotRecord[] = [];
  exactHits = 0;

  getExact(coordinate: WarpStateCoordinate): Promise<WarpStateSnapshotRecord | null> {
    const found = this.#snapshots.find((snapshot) => sameCoordinate(snapshot.coordinate, coordinate)) ?? null;
    this.exactHits += found === null ? 0 : 1;
    return Promise.resolve(found);
  }

  getBestCompatiblePredecessor(_coordinate: WarpStateCoordinate): Promise<WarpStateSnapshotRecord | null> {
    return Promise.resolve(null);
  }

  put(snapshot: WarpStateSnapshotRecord): Promise<WarpStateSnapshotRecord> {
    this.#snapshots.push(snapshot);
    return Promise.resolve(snapshot);
  }

  pin(snapshotId: string): Promise<WarpStateSnapshotRecord> {
    const found = this.#snapshots.find((snapshot) => snapshot.snapshotId === snapshotId);
    return found === undefined ? Promise.reject(new Error(`no snapshot ${snapshotId}`)) : Promise.resolve(found);
  }

  publishCheckpointHead(_graphName: string, _snapshotId: string): Promise<void> {
    return Promise.resolve();
  }

  resolveCheckpointHead(_graphName: string): Promise<WarpStateSnapshotRecord | null> {
    return Promise.resolve(null);
  }

  pruneEvictable(): Promise<void> {
    return Promise.resolve();
  }
}

type CachedHost = Awaited<ReturnType<typeof openRuntimeHostProduct>>;

async function withCachedHost<T>(cwd: string, writerId: string, stateCache: SnapshotCache, work: (host: CachedHost) => Promise<T>): Promise<T> {
  const ports = getDefaultRuntimeHostNodePorts();
  const storage = await GitStorage.open({ cwd });
  try {
    const binding = resolveWarpStorage(storage);
    const host = await openRuntimeHostProduct({
      persistence: binding.history,
      runtimeStorage: binding.runtimeStorage,
      graphName: JOURNAL_GRAPH,
      writerId,
      codec: ports.codec,
      crypto: ports.crypto,
      trustCrypto: ports.trustCrypto,
      commitMessageCodec: ports.commitMessageCodec,
      stateCache,
    });
    return await work(host);
  } finally {
    await storage.close();
  }
}

/** Removes the retained materializations, so that only the state-cache snapshot can serve the next read. */
function dropRetainedMaterializations(cwd: string): void {
  const refs = execFileSync('git', ['-C', cwd, 'for-each-ref', '--format=%(refname)', 'refs/cas/'], { encoding: 'utf8' })
    .split('\n').filter((ref) => ref.length > 0);
  for (const ref of refs) {
    execFileSync('git', ['-C', cwd, 'update-ref', '-d', ref]);
  }
}

/** bea adds x, syncs peer's malformed remove of n1, adds y and checkpoints; a fresh host then materializes. */
async function materializeAfterMalformedSync(observedDot: string): Promise<{ nodes: string[]; exactHits: number }> {
  return await inGitRepo('session-seed-malformed', async (cwd) => {
    const cache = new SnapshotCache();
    await withCachedHost(cwd, 'bea', cache, async (bea) => {
      await (await bea.createPatch()).addNode('x').commit();
      await bea.materialize();
      const remove = new Patch({ writer: 'peer', lamport: 1, context: {}, ops: [new NodeRemove('n1', [observedDot])] });
      await bea._syncController.applySyncResponse({
        type: 'sync-response', frontier: { peer: PEER_SHA }, patches: [{ writerId: 'peer', sha: PEER_SHA, patch: remove }],
      });
      await (await bea.createPatch()).addNode('y').commit();
      await bea.createCheckpoint();
    });
    dropRetainedMaterializations(cwd);
    return await withCachedHost(cwd, 'reader', cache, async (reader) => {
      const state = await reader.materialize();
      return { nodes: [...state.nodeAlive.elements()].sort(), exactHits: cache.exactHits };
    });
  });
}

describe('a session that starts from a snapshot holding a malformed sync-applied tombstone (#1153)', () => {
  for (const observedDot of ['peer:01', 'not-a-dot']) {
    it(`materializes when the tombstone is ${observedDot}`, SCENARIO_TIMEOUT, async () => {
      expect(await materializeAfterMalformedSync(observedDot)).toEqual({ nodes: ['x', 'y'], exactHits: 1 });
    });
  }
});
