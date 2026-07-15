/**
 * syncPatchLoader — patch loading helpers for the WARP sync protocol.
 *
 * Handles reading patches from Git commits: decoding commit messages,
 * loading patch blobs, and walking writer chains to collect patch ranges.
 *
 * @module domain/services/sync/syncPatchLoader
 * @see SyncProtocol — WARP sync spec Section 11 (Network Sync)
 */

import { requireCommitMessageCodec } from '../codec/CommitMessageCodecRequirement.ts';
import PersistenceError from '../../errors/PersistenceError.ts';
import SyncError from '../../errors/SyncError.ts';
import VersionVector from '../../crdt/VersionVector.ts';
import Patch from '../../types/Patch.ts';
import type { PatchOp } from '../../types/ops/unions.ts';
import type CommitPort from '../../../ports/CommitPort.ts';
import type PatchJournalPort from '../../../ports/PatchJournalPort.ts';
import type CommitMessageCodecPort from '../../../ports/CommitMessageCodecPort.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DecodedPatch {
  context: VersionVector | Map<string, number> | Record<string, number> | null | undefined;
  ops: PatchOp[];
  writer: string;
  lamport: number;
  schema?: 2 | 3;
  reads?: string[] | undefined;
  writes?: string[] | undefined;
}

export interface LoadPatchRangeOptions {
  patchJournal?: PatchJournalPort;
  commitMessageCodec?: CommitMessageCodecPort;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Normalizes a patch after CBOR deserialization.
 *
 * CBOR deserialization can return plain JavaScript objects, but the CRDT
 * merge logic (JoinReducer) expects the context field to be a VersionVector.
 * This function always constructs a validated Patch so decoded objects cannot
 * bypass constructor invariants.
 */
export function normalizePatch(patch: DecodedPatch): DecodedPatch {
  const context = patch.context instanceof VersionVector
    ? patch.context
    : (patch.context === null || patch.context === undefined)
        ? VersionVector.empty()
        : VersionVector.from(patch.context);
  const patchInput = {
    writer: patch.writer,
    lamport: patch.lamport,
    context,
    ops: patch.ops,
    reads: patch.reads,
    writes: patch.writes,
  };
  if (patch.schema === undefined) {
    return new Patch(patchInput);
  }
  return new Patch({ schema: patch.schema, ...patchInput });
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Loads a patch from a commit.
 *
 * WARP stores patch assets behind opaque handles carried by the commit
 * message. This function:
 * 1. Reads the commit message via `showNode()`
 * 2. Decodes the message to extract the patch asset handle
 * 3. Opens and CBOR-decodes the asset via `patchJournal.readPatch()`
 * 4. Normalizes the patch (converts context to VersionVector)
 *
 * @param persistence - Causal commit history port
 * @param sha - The 40-character commit SHA to load the patch from
 * @param options - Options including optional patchJournal
 * @throws {PersistenceError} If patchJournal is not provided
 * @throws {Error} If the commit or patch asset cannot be read or decoded
 */
export async function loadPatchFromCommit(
  persistence: CommitPort,
  sha: string,
  { patchJournal, commitMessageCodec }: LoadPatchRangeOptions = {},
): Promise<DecodedPatch> {
  if (!patchJournal) {
    throw new PersistenceError(
      'patchJournal is required for loading patches',
      PersistenceError.E_MISSING_OBJECT,
      { context: { sha } },
    );
  }

  // Read commit metadata to locate the patch asset.
  const messageCodec = requireCommitMessageCodec(commitMessageCodec);
  const message = await persistence.showNode(sha);
  const decoded = messageCodec.decodePatch(message);

  // Read and decode the patch blob via PatchJournalPort (adapter owns the codec)
  const patch = await patchJournal.readPatch(decoded);

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
  persistence: CommitPort,
  _graphName: string,
  writerId: string,
  fromSha: string | null,
  toSha: string,
  { patchJournal, commitMessageCodec }: LoadPatchRangeOptions = {},
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
      {
        ...(patchJournal !== undefined ? { patchJournal } : {}),
        ...(commitMessageCodec !== undefined ? { commitMessageCodec } : {}),
      },
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
