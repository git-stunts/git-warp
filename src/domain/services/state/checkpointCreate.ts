/**
 * Checkpoint creation logic for WARP multi-writer graph database.
 *
 * Supports current checkpoint envelope creation with optional index tree.
 *
 * @module domain/services/state/checkpointCreate
 * @see WARP Spec Section 10
 */

import { computeStateHash } from './StateSerializer.ts';
import {
  computeAppliedVV,
  serializeAppliedVV,
  serializeCheckpointStateEnvelope,
} from './CheckpointSerializer.ts';
import { serializeFrontier } from '../Frontier.ts';
import { requireCodec } from '../codec/CodecRequirement.ts';
import { requireCrypto } from '../crypto/CryptoRequirement.ts';
import { requireCommitMessageCodec } from '../codec/CommitMessageCodecRequirement.ts';
import { cloneState } from '../JoinReducer.ts';
import {
  writeIndexSubtree,
  collectContentAnchorEntries,
  compareTreeEntriesByPath,
  CURRENT_CHECKPOINT_SCHEMA,
  type ContentAnchorObjectType,
} from './checkpointHelpers.ts';
import type WarpState from './WarpState.ts';
import type CommitPort from '../../../ports/CommitPort.ts';
import type BlobPort from '../../../ports/BlobPort.ts';
import type TreePort from '../../../ports/TreePort.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type CommitMessageCodecPort from '../../../ports/CommitMessageCodecPort.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import type CheckpointStorePort from '../../../ports/CheckpointStorePort.ts';
import type {
  CheckpointRecord,
  CheckpointWriteResult,
} from '../../../ports/CheckpointStorePort.ts';
import type StateHashService from './StateHashService.ts';
import type { ProvenanceIndex } from '../provenance/ProvenanceIndex.ts';

/** Combined persistence surface needed by checkpoint creation. */
export type CheckpointPersistence = CommitPort & BlobPort & TreePort & {
  readObjectType?(_oid: string): Promise<ContentAnchorObjectType>;
};

/** Options for creating the current checkpoint envelope. */
export interface CreateCheckpointOptions {
  persistence: CheckpointPersistence;
  graphName: string;
  state: WarpState;
  frontier: Map<string, string>;
  parents?: string[];
  compact?: boolean;
  provenanceIndex?: ProvenanceIndex;
  codec?: CodecPort;
  commitMessageCodec: CommitMessageCodecPort;
  crypto?: CryptoPort;
  indexTree?: Record<string, Uint8Array>;
  checkpointStore?: CheckpointStorePort;
  stateHashService?: StateHashService;
}

/**
 * Creates a checkpoint commit containing a state envelope and frontier.
 *
 * Tree structure:
 * ```
 * <checkpoint_commit_tree>/
 * ├── state/               # AUTHORITATIVE: state envelope
 * ├── frontier.cbor        # Writer frontiers
 * ├── appliedVV.cbor       # Version vector of dots in state
 * └── provenanceIndex.cbor # Optional: node-to-patchSha index (HG/IO/2)
 * ```
 *
 * @returns The checkpoint commit SHA
 */
export async function create(options: CreateCheckpointOptions): Promise<string> {
  return await createCheckpointEnvelope(options);
}

/**
 * Creates a checkpoint commit with full ORSet state envelope.
 *
 * Checkpoint Tree Structure:
 * ```
 * <checkpoint_tree>/
 * ├── state/               # AUTHORITATIVE: state envelope
 * ├── frontier.cbor        # Writer frontiers
 * ├── appliedVV.cbor       # Version vector of dots in state
 * └── provenanceIndex.cbor # Optional: node-to-patchSha index (HG/IO/2)
 * ```
 *
 * @returns The checkpoint commit SHA
 */
export async function createCheckpointEnvelope({
  persistence,
  graphName,
  state,
  frontier,
  parents = [],
  compact = true,
  provenanceIndex,
  codec,
  commitMessageCodec,
  crypto,
  indexTree,
  checkpointStore,
  stateHashService,
}: CreateCheckpointOptions): Promise<string> {
  const messageCodec = requireCommitMessageCodec(commitMessageCodec);
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

  // 3–6. Serialize and write current state envelope, frontier, appliedVV.
  // Runtime callers route artifact encoding through CheckpointStorePort so the
  // domain path no longer needs to know the concrete checkpoint blob layout.
  let stateHash: string;

  // Compute stateHash first via StateHashService (preferred) or direct fallback.
  if (stateHashService !== undefined && stateHashService !== null) {
    stateHash = await stateHashService.compute(checkpointState);
  } else {
    stateHash = await computeStateHash(checkpointState, {
      codec: requireCodec(codec, 'createCheckpointEnvelope'),
      crypto: requireCrypto(crypto, 'createCheckpointEnvelope'),
    });
  }

  const checkpointRecord: CheckpointRecord = {
    state: checkpointState,
    frontier,
    appliedVV,
    stateHash,
    ...(provenanceIndex !== undefined ? { provenanceIndex } : {}),
  };
  const checkpointWrite = checkpointStore !== undefined && checkpointStore !== null
    ? await checkpointStore.writeCheckpoint(checkpointRecord)
    : await writeFallbackCheckpointArtifacts(
      persistence,
      checkpointRecord,
      requireCodec(codec, 'createCheckpointEnvelope'),
    );
  const {
    nodeAliveBlobOid: nodeAliveOid,
    edgeAliveBlobOid: edgeAliveOid,
    propBlobOid: propOid,
    observedFrontierBlobOid: observedFrontierOid,
    edgeBirthEventBlobOid: edgeBirthEventOid,
    frontierBlobOid,
    appliedVVBlobOid,
    provenanceIndexBlobOid,
  } = checkpointWrite;

  // 6c. Collect content storage OIDs from state properties for GC anchoring.
  // If patch commits are ever pruned, content trees remain reachable via
  // the checkpoint tree. Without this, git gc would nuke content trees
  // whose only anchor was the (now-pruned) patch commit tree.
  //
  // O(P) scan over all properties — acceptable because checkpoint creation
  // is infrequent. The property key format is deterministic (encodePropKey /
  // encodeEdgePropKey), but content keys are interleaved with regular keys
  // so no prefix filter can skip non-content entries without decoding.
  // 7. Create the state subtree and outer envelope tree with sorted entries.
  const stateTreeEntries = [
    `100644 blob ${edgeAliveOid}\tedgeAlive`,
    `100644 blob ${edgeBirthEventOid}\tedgeBirthEvent.cbor`,
    `100644 blob ${nodeAliveOid}\tnodeAlive`,
    `100644 blob ${observedFrontierOid}\tobservedFrontier.cbor`,
    `100644 blob ${propOid}\tprop.cbor`,
  ];
  stateTreeEntries.sort(compareTreeEntriesByPath);
  const stateTreeOid = await persistence.writeTree(stateTreeEntries);

  // 7b. Optionally write index subtree.
  let indexSubtreeOid: string | null = null;
  if (indexTree) {
    indexSubtreeOid = await writeIndexSubtree(indexTree, persistence);
  }

  const treeEntries = await collectContentAnchorEntries(
    checkpointState.allPropEntries(),
    persistence.readObjectType?.bind(persistence),
  );
  treeEntries.push(
    `100644 blob ${appliedVVBlobOid}\tappliedVV.cbor`,
    `100644 blob ${frontierBlobOid}\tfrontier.cbor`,
    `040000 tree ${stateTreeOid}\tstate`,
  );

  // Add provenance index if present
  if (provenanceIndexBlobOid !== null) {
    treeEntries.push(`100644 blob ${provenanceIndexBlobOid}\tprovenanceIndex.cbor`);
  }

  // Add index subtree if present.
  if (indexSubtreeOid !== null) {
    treeEntries.push(`040000 tree ${indexSubtreeOid}\tindex`);
  }

  // Sort entries by filename for deterministic tree (git requires sorted entries by path)
  treeEntries.sort(compareTreeEntriesByPath);

  const treeOid = await persistence.writeTree(treeEntries);

  // 8. Create checkpoint commit message.
  const message = messageCodec.encodeCheckpoint({
    kind: 'checkpoint',
    graph: graphName,
    stateHash,
    frontierOid: frontierBlobOid,
    indexOid: treeOid,
    schema: CURRENT_CHECKPOINT_SCHEMA,
    checkpointVersion: null,
  });

  // 9. Create the checkpoint commit
  const checkpointSha = await persistence.commitNodeWithTree({
    treeOid,
    parents,
    message,
  });

  return checkpointSha;
}

async function writeFallbackCheckpointArtifacts(
  persistence: CheckpointPersistence,
  record: CheckpointRecord,
  codec: CodecPort,
): Promise<CheckpointWriteResult> {
  const codecOpt = { codec };
  const envelope = serializeCheckpointStateEnvelope(record.state, codecOpt);
  const [
    nodeAliveBlobOid,
    edgeAliveBlobOid,
    propBlobOid,
    observedFrontierBlobOid,
    edgeBirthEventBlobOid,
    frontierBlobOid,
    appliedVVBlobOid,
    provenanceIndexBlobOid,
  ] = await Promise.all([
    persistence.writeBlob(envelope.nodeAlive),
    persistence.writeBlob(envelope.edgeAlive),
    persistence.writeBlob(envelope.prop),
    persistence.writeBlob(envelope.observedFrontier),
    persistence.writeBlob(envelope.edgeBirthEvent),
    persistence.writeBlob(serializeFrontier(record.frontier, codecOpt)),
    persistence.writeBlob(serializeAppliedVV(record.appliedVV, codecOpt)),
    record.provenanceIndex === undefined || record.provenanceIndex === null
      ? Promise.resolve(null)
      : persistence.writeBlob(record.provenanceIndex.serialize(codecOpt)),
  ]);
  return {
    nodeAliveBlobOid,
    edgeAliveBlobOid,
    propBlobOid,
    observedFrontierBlobOid,
    edgeBirthEventBlobOid,
    frontierBlobOid,
    appliedVVBlobOid,
    provenanceIndexBlobOid,
  };
}
