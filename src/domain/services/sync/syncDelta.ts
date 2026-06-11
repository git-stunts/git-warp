/**
 * syncDelta — delta computation for the WARP sync protocol.
 *
 * Computes what patches each side needs by comparing frontiers, and
 * provides a fast check for whether sync is needed at all.
 *
 * @module domain/services/sync/syncDelta
 * @see SyncProtocol — WARP sync spec Section 11 (Network Sync)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A range of patches a writer needs, from (exclusive) to (inclusive). */
export interface WriterRange {
  from: string | null;
  to: string;
}

/** Result of comparing two frontiers to determine what each side needs. */
export interface SyncDelta {
  /** Writers/ranges that local needs to fetch from remote */
  needFromRemote: Map<string, WriterRange>;
  /** Writers/ranges that remote needs to fetch from local */
  needFromLocal: Map<string, WriterRange>;
  /** Writers completely new to local (subset of needFromRemote keys) */
  newWritersForLocal: string[];
  /** Writers completely new to remote (subset of needFromLocal keys) */
  newWritersForRemote: string[];
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Computes what patches each side needs based on frontiers.
 *
 * This is the core delta computation for sync. By comparing frontiers
 * (which writer SHAs each side has), we determine:
 * - What local needs from remote (to catch up)
 * - What remote needs from local (to catch up)
 * - Which writers are completely new to each side
 *
 * **Algorithm**:
 * 1. For each writer in remote frontier:
 *    - Not in local? Local needs all patches (from: null)
 *    - Different SHA? Local needs patches from its SHA to remote's SHA
 * 2. For each writer in local frontier:
 *    - Not in remote? Remote needs all patches (from: null)
 *    - Different SHA and not already in needFromRemote? Remote needs patches
 *
 * **Assumptions**:
 * - When SHAs differ, we assume remote is ahead. The actual ancestry
 *   is verified during loadPatchRange() which will throw on divergence.
 * - Writers with identical SHAs in both frontiers are already in sync.
 *
 * **Pure function**: Does not modify inputs or perform I/O.
 *
 * @param localFrontier - Local writer heads (writerId → SHA)
 * @param remoteFrontier - Remote writer heads (writerId → SHA)
 * @returns Sync delta describing what each side needs
 *
 * @example
 * const local = new Map([['w1', 'sha-a'], ['w2', 'sha-b']]);
 * const remote = new Map([['w1', 'sha-c'], ['w3', 'sha-d']]);
 * const delta = computeSyncDelta(local, remote);
 * // delta.needFromRemote: Map { 'w1' => {from: 'sha-a', to: 'sha-c'}, 'w3' => {from: null, to: 'sha-d'} }
 * // delta.needFromLocal: Map { 'w2' => {from: null, to: 'sha-b'} }
 * // delta.newWritersForLocal: ['w3']
 * // delta.newWritersForRemote: ['w2']
 */
export function computeSyncDelta(
  localFrontier: Map<string, string>,
  remoteFrontier: Map<string, string>,
): SyncDelta {
  const needFromRemote = new Map<string, WriterRange>();
  const needFromLocal = new Map<string, WriterRange>();
  const newWritersForLocal: string[] = [];
  const newWritersForRemote: string[] = [];

  // Check what local needs from remote
  for (const [writerId, remoteSha] of remoteFrontier) {
    const localSha = localFrontier.get(writerId);

    if (localSha === undefined) {
      // New writer for local - need all patches
      needFromRemote.set(writerId, { from: null, to: remoteSha });
      newWritersForLocal.push(writerId);
    } else if (localSha !== remoteSha) {
      // Different heads - local needs patches from its head to remote head
      // Direction is intentionally deferred: ancestry is verified by
      // isAncestor() pre-check or loadPatchRange() in processSyncRequest()
      needFromRemote.set(writerId, { from: localSha, to: remoteSha });
    }
    // If localSha === remoteSha, already in sync for this writer
  }

  // Check what remote needs from local
  for (const [writerId, localSha] of localFrontier) {
    const remoteSha = remoteFrontier.get(writerId);

    if (remoteSha === undefined) {
      // New writer for remote - need all patches
      needFromLocal.set(writerId, { from: null, to: localSha });
      newWritersForRemote.push(writerId);
    } else if (remoteSha !== localSha) {
      // Different heads - remote might need patches from its head to local head
      // Always add both directions — ancestry is verified during loadPatchRange()
      // which will throw E_SYNC_DIVERGENCE if neither side descends from the other (S3)
      needFromLocal.set(writerId, { from: remoteSha, to: localSha });
    }
  }

  return {
    needFromRemote,
    needFromLocal,
    newWritersForLocal,
    newWritersForRemote,
  };
}

/**
 * Checks if a sync is needed between two frontiers.
 *
 * A fast comparison to determine if two nodes have diverged. This can be
 * used to skip expensive sync operations when nodes are already in sync.
 *
 * **Comparison logic**:
 * 1. If frontier sizes differ, sync is needed (different writer sets)
 * 2. If any writer has a different SHA, sync is needed
 * 3. Otherwise, frontiers are identical and no sync is needed
 *
 * **Note**: This only checks for differences, not direction. Even if this
 * returns true, it's possible that local is ahead of remote (not just behind).
 *
 * @param localFrontier - Local frontier
 * @param remoteFrontier - Remote frontier
 * @returns True if frontiers differ and sync is needed
 *
 * @example
 * if (syncNeeded(localFrontier, remoteFrontier)) {
 *   const request = createSyncRequest(localFrontier);
 *   // ... perform sync
 * } else {
 *   console.log('Already in sync');
 * }
 */
export function syncNeeded(
  localFrontier: Map<string, string>,
  remoteFrontier: Map<string, string>,
): boolean {
  // Different number of writers means sync needed
  if (localFrontier.size !== remoteFrontier.size) {
    return true;
  }

  // Check if any writer has different head
  for (const [writerId, localSha] of localFrontier) {
    const remoteSha = remoteFrontier.get(writerId);
    if (remoteSha !== localSha) {
      return true;
    }
  }

  return false;
}
