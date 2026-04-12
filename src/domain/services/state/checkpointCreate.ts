/**
 * Checkpoint creation logic for WARP multi-writer graph database.
 *
 * Supports V5 checkpoint creation with optional index tree (schema:4).
 *
 * @module domain/services/state/checkpointCreate
 * @see WARP Spec Section 10
 */

import { computeStateHashV5 } from './StateSerializerV5.js';
import {
  serializeFullStateV5,
  computeAppliedVV,
  serializeAppliedVV,
} from './CheckpointSerializerV5.js';
import { serializeFrontier } from '../Frontier.ts';
import { encodeCheckpointMessage } from '../codec/WarpMessageCodec.ts';
import { cloneState } from '../JoinReducer.ts';
import {
  writeIndexSubtree,
  collectContentAnchorEntries,
  compareTreeEntriesByPath,
  CHECKPOINT_SCHEMA_STANDARD,
  CHECKPOINT_SCHEMA_INDEX_TREE,
} from './checkpointHelpers.ts';
import type WarpState from './WarpState.ts';
import type CommitPort from '../../../ports/CommitPort.ts';
import type BlobPort from '../../../ports/BlobPort.ts';
import type TreePort from '../../../ports/TreePort.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import type CheckpointStorePort from '../../../ports/CheckpointStorePort.ts';
import type StateHashService from './StateHashService.js';
import type { ProvenanceIndex } from '../provenance/ProvenanceIndex.js';

/** Combined persistence surface needed by checkpoint creation. */
export type CheckpointPersistence = CommitPort & BlobPort & TreePort;

/** Options shared by create() and createV5(). */
export interface CreateCheckpointOptions {
  persistence: CheckpointPersistence;
  graphName: string;
  state: WarpState;
  frontier: Map<string, string>;
  parents?: string[];
  compact?: boolean;
  provenanceIndex?: ProvenanceIndex;
  codec?: CodecPort;
  crypto?: CryptoPort;
  indexTree?: Record<string, Uint8Array>;
  checkpointStore?: CheckpointStorePort;
  stateHashService?: StateHashService;
}

/**
 * Creates a schema:2 checkpoint commit containing serialized V5 state and frontier.
 *
 * Compatibility wrapper — delegates to createV5.
 *
 * Tree structure:
 * ```
 * <checkpoint_commit_tree>/
 * ├── state.cbor           # AUTHORITATIVE: Full V5 state (ORSets + props)
 * ├── frontier.cbor        # Writer frontiers
 * ├── appliedVV.cbor       # Version vector of dots in state
 * └── provenanceIndex.cbor # Optional: node-to-patchSha index (HG/IO/2)
 * ```
 *
 * @returns The checkpoint commit SHA
 */
export async function create(options: CreateCheckpointOptions): Promise<string> {
  return await createV5(options);
}

/**
 * Creates a V5 checkpoint commit with full ORSet state.
 *
 * V5 Checkpoint Tree Structure:
 * ```
 * <checkpoint_tree>/
 * ├── state.cbor           # AUTHORITATIVE: Full V5 state (ORSets + props)
 * ├── frontier.cbor        # Writer frontiers
 * ├── appliedVV.cbor       # Version vector of dots in state
 * └── provenanceIndex.cbor # Optional: node-to-patchSha index (HG/IO/2)
 * ```
 *
 * @returns The checkpoint commit SHA
 */
export async function createV5({
  persistence,
  graphName,
  state,
  frontier,
  parents = [],
  compact = true,
  provenanceIndex,
  codec,
  crypto,
  indexTree,
  checkpointStore,
  stateHashService,
}: CreateCheckpointOptions): Promise<string> {
  // 1. Compute appliedVV from actual state dots
  const appliedVV = computeAppliedVV(state);

  // 2. Optionally compact (only tombstoned dots <= appliedVV).
  // When compact=false, checkpointState aliases the caller's state but the
  // remaining path is read-only (serialize + hash), so no clone is needed.
  let checkpointState = state;
  if (compact) {
    checkpointState = cloneState(state);
    checkpointState.nodeAlive.compact(appliedVV);
    checkpointState.edgeAlive.compact(appliedVV);
  }

  // 3–6. Serialize and write state, frontier, appliedVV.
  // When checkpointStore is available, it owns serialization + blob writes.
  // Otherwise fall back to the legacy serialize + writeBlob path.
  // codecOpt is still needed for provenance index serialization (Slice 4 scope).
  const codecOpt = codec !== undefined && codec !== null ? { codec } : {};
  let stateBlobOid: string;
  let stateHash: string;
  let frontierBlobOid: string;
  let appliedVVBlobOid: string;
  let provenanceIndexBlobOid: string | null = null;

  if (checkpointStore !== undefined && checkpointStore !== null) {
    // Compute stateHash first via StateHashService (preferred) or legacy fallback
    if (stateHashService !== undefined && stateHashService !== null) {
      stateHash = await stateHashService.compute(checkpointState);
    } else {
      stateHash = await computeStateHashV5(checkpointState, { ...codecOpt, crypto: crypto as CryptoPort });
    }
    const writeResult = await checkpointStore.writeCheckpoint({
      state: checkpointState,
      frontier,
      appliedVV,
      stateHash,
      ...(provenanceIndex ? { provenanceIndex } : {}),
    });
    stateBlobOid = writeResult.stateBlobOid;
    frontierBlobOid = writeResult.frontierBlobOid;
    appliedVVBlobOid = writeResult.appliedVVBlobOid;
    provenanceIndexBlobOid = writeResult.provenanceIndexBlobOid;
  } else {
    // Legacy path: serialize in-process, write raw blobs
    const stateBuffer = serializeFullStateV5(checkpointState, codecOpt);
    stateHash = await computeStateHashV5(checkpointState, { ...codecOpt, crypto: crypto as CryptoPort });
    const frontierBuffer = serializeFrontier(frontier, codecOpt);
    const appliedVVBuffer = serializeAppliedVV(appliedVV, codecOpt);
    stateBlobOid = await persistence.writeBlob(stateBuffer);
    frontierBlobOid = await persistence.writeBlob(frontierBuffer);
    appliedVVBlobOid = await persistence.writeBlob(appliedVVBuffer);

    // 6b. Optionally serialize and write provenance index (legacy path only;
    // when checkpointStore is used, writeCheckpoint already wrote it)
    if (provenanceIndex) {
      const provenanceIndexBuffer = provenanceIndex.serialize(codecOpt);
      provenanceIndexBlobOid = await persistence.writeBlob(provenanceIndexBuffer);
    }
  }

  // 6c. Optionally write index subtree (schema 4)
  let indexSubtreeOid: string | null = null;
  if (indexTree) {
    indexSubtreeOid = await writeIndexSubtree(indexTree, persistence);
  }

  // 6d. Collect content blob OIDs from state properties for GC anchoring.
  // If patch commits are ever pruned, content blobs remain reachable via
  // the checkpoint tree. Without this, git gc would nuke content blobs
  // whose only anchor was the (now-pruned) patch commit tree.
  //
  // O(P) scan over all properties — acceptable because checkpoint creation
  // is infrequent. The property key format is deterministic (encodePropKey /
  // encodeEdgePropKey), but content keys are interleaved with regular keys
  // so no prefix filter can skip non-content entries without decoding.
  // 7. Create tree with sorted entries
  const treeEntries = collectContentAnchorEntries(checkpointState.prop);
  treeEntries.push(
    `100644 blob ${appliedVVBlobOid}\tappliedVV.cbor`,
    `100644 blob ${frontierBlobOid}\tfrontier.cbor`,
    `100644 blob ${stateBlobOid}\tstate.cbor`,
  );

  // Add provenance index if present
  if (provenanceIndexBlobOid !== null) {
    treeEntries.push(`100644 blob ${provenanceIndexBlobOid}\tprovenanceIndex.cbor`);
  }

  // Add index subtree if present (schema 4)
  if (indexSubtreeOid !== null) {
    treeEntries.push(`040000 tree ${indexSubtreeOid}\tindex`);
  }

  // Sort entries by filename for deterministic tree (git requires sorted entries by path)
  treeEntries.sort(compareTreeEntriesByPath);

  const treeOid = await persistence.writeTree(treeEntries);

  // 8. Create checkpoint commit message with v5 trailer
  const message = encodeCheckpointMessage({
    graph: graphName,
    stateHash,
    frontierOid: frontierBlobOid,
    indexOid: treeOid,
    // Schema 3 was used for edge-property-aware patches but is never emitted
    // by checkpoint creation. Schema 4 indicates an index tree is present.
    schema: indexTree ? CHECKPOINT_SCHEMA_INDEX_TREE : CHECKPOINT_SCHEMA_STANDARD,
  });

  // 9. Create the checkpoint commit
  const checkpointSha = await persistence.commitNodeWithTree({
    treeOid,
    parents,
    message,
  });

  return checkpointSha;
}
