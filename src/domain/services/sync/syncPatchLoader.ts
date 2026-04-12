/**
 * syncPatchLoader — patch loading helpers for the WARP V5 sync protocol.
 *
 * Handles reading patches from Git commits: decoding commit messages,
 * loading patch blobs, and walking writer chains to collect patch ranges.
 *
 * @module domain/services/sync/syncPatchLoader
 * @see SyncProtocol — WARP V5 Spec Section 11 (Network Sync)
 */

import { decodePatchMessage } from '../codec/WarpMessageCodec.ts';
import PersistenceError from '../../errors/PersistenceError.ts';
import SyncError from '../../errors/SyncError.ts';
import VersionVector from '../../crdt/VersionVector.ts';
import type CommitPort from '../../../ports/CommitPort.ts';
import type BlobPort from '../../../ports/BlobPort.ts';
import type PatchJournalPort from '../../../ports/PatchJournalPort.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A decoded patch object after CBOR deserialization.
 *
 * CBOR maps deserialize to plain objects; the `context` field is
 * converted to a VersionVector by `normalizePatch()` before use.
 */
export interface DecodedPatch {
  /** VersionVector (Map after normalization, plain object before) */
  context?: VersionVector | Map<string, number> | Record<string, number> | null;
  /** Ordered array of operations */
  ops: Array<{ type: string; [key: string]: unknown }>;
  /** Writer ID */
  writer?: string;
  /** Lamport timestamp */
  lamport?: number;
  /** Schema version */
  schema?: number;
}

export interface LoadPatchRangeOptions {
  patchJournal?: PatchJournalPort;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes a patch after CBOR deserialization.
 *
 * CBOR deserialization returns plain JavaScript objects, but the CRDT
 * merge logic (JoinReducer) expects the context field to be a VersionVector.
 * This function performs the conversion in-place and returns the same object.
 *
 * **Mutation**: This function mutates the input patch object for efficiency.
 */
export function normalizePatch(patch: DecodedPatch): DecodedPatch {
  if (patch.context !== null && patch.context !== undefined && !(patch.context instanceof VersionVector)) {
    patch.context = VersionVector.from(patch.context as Record<string, number>);
  }
  return patch;
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Loads a patch from a commit.
 *
 * WARP stores patches as Git blobs, with the blob OID embedded in the
 * commit message. This function:
 * 1. Reads the commit message via `showNode()`
 * 2. Decodes the message to extract the patch blob OID
 * 3. Reads the blob and CBOR-decodes it via `patchJournal.readPatch()`
 * 4. Normalizes the patch (converts context to VersionVector)
 *
 * @param persistence - Git persistence layer (CommitPort + BlobPort)
 * @param sha - The 40-character commit SHA to load the patch from
 * @param options - Options including optional patchJournal
 * @throws {PersistenceError} If patchJournal is not provided
 * @throws {Error} If the commit or patch blob cannot be read or decoded
 */
export async function loadPatchFromCommit(
  persistence: CommitPort & BlobPort,
  sha: string,
  { patchJournal }: LoadPatchRangeOptions = {},
): Promise<DecodedPatch> {
  if (!patchJournal) {
    throw new PersistenceError(
      'patchJournal is required for loading patches',
      PersistenceError.E_MISSING_OBJECT,
      { context: { sha } },
    );
  }

  // Read commit message to extract patch OID and encrypted flag
  const message = await persistence.showNode(sha);
  const decoded = decodePatchMessage(message);

  // Read and decode the patch blob via PatchJournalPort (adapter owns the codec)
  const patch = await patchJournal.readPatch(decoded.patchOid, { encrypted: decoded.encrypted }) as unknown as DecodedPatch;

  return normalizePatch(patch);
}

/**
 * Loads patches for a writer between two SHAs.
 *
 * Walks the commit graph backwards from `toSha` to `fromSha` (exclusive),
 * collecting patches along the way. Returns them in chronological order
 * (oldest first) for correct application.
 *
 * **Ancestry requirement**: `toSha` must be a descendant of `fromSha` in the
 * writer's linear chain. If not, a divergence error is thrown.
 *
 * **Performance**: O(N) where N is the number of commits between fromSha and toSha.
 * Each commit requires two reads: commit info (for parent) and patch blob.
 *
 * @param persistence - Git persistence layer (CommitPort + BlobPort)
 * @param _graphName - Graph name (used in error messages, not for lookups)
 * @param writerId - Writer ID (used in error messages, not for lookups)
 * @param fromSha - Start SHA (exclusive). Pass null to load ALL patches from chain start.
 * @param toSha - End SHA (inclusive). Typically the writer's current tip.
 * @param options - Options including optional patchJournal
 * @returns Array of patch objects in chronological order (oldest first)
 * @throws {SyncError} If divergence is detected (toSha does not descend from fromSha)
 * @throws {Error} If any commit or patch cannot be loaded
 *
 * @example
 * // Load patches from sha-a (exclusive) to sha-c (inclusive)
 * const patches = await loadPatchRange(persistence, 'events', 'node-1', 'sha-a', 'sha-c');
 * // Returns [{patch, sha: 'sha-b'}, {patch, sha: 'sha-c'}] in chronological order
 *
 * @example
 * // Load ALL patches for a new writer
 * const patches = await loadPatchRange(persistence, 'events', 'new-writer', null, tipSha);
 */
export async function loadPatchRange(
  persistence: CommitPort & BlobPort,
  _graphName: string,
  writerId: string,
  fromSha: string | null,
  toSha: string,
  { patchJournal }: LoadPatchRangeOptions = {},
): Promise<Array<{ patch: DecodedPatch; sha: string }>> {
  const patches: Array<{ patch: DecodedPatch; sha: string }> = [];
  let cur: string | null = toSha;

  while (cur !== null && cur !== fromSha) {
    // Load commit info to get parent
    const commitInfo = await persistence.getNodeInfo(cur);

    // Load patch from commit
    const patch = await loadPatchFromCommit(
      persistence,
      cur,
      patchJournal !== undefined ? { patchJournal } : {},
    );
    patches.unshift({ patch, sha: cur }); // Prepend for chronological order

    // Move to parent (first parent in linear chain)
    const nextParent: string | null = commitInfo.parents?.[0] ?? null;
    cur = nextParent;
  }

  // If fromSha was specified but we didn't reach it, we have divergence
  if (fromSha !== null && fromSha !== undefined && fromSha.length > 0 && cur === null) {
    throw new SyncError(
      `Divergence detected: ${toSha} does not descend from ${fromSha} for writer ${writerId}`,
      { code: 'E_SYNC_DIVERGENCE', context: { writerId, fromSha, toSha } },
    );
  }

  return patches;
}
