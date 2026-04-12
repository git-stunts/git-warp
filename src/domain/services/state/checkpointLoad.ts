/**
 * Checkpoint loading and incremental materialization for WARP.
 *
 * Provides loadCheckpoint, materializeIncremental, and
 * reconstructStateFromCheckpoint.
 *
 * @module domain/services/state/checkpointLoad
 * @see WARP Spec Section 10
 */

import {
  deserializeFullState,
  deserializeAppliedVV,
} from './CheckpointSerializer.js';
import { deserializeFrontier } from '../Frontier.ts';
import { decodeCheckpointMessage } from '../codec/WarpMessageCodec.ts';
import ORSet from '../../crdt/ORSet.ts';
import { Dot } from '../../crdt/Dot.ts';
import VersionVector from '../../crdt/VersionVector.ts';
import { LWWRegister } from '../../crdt/LWW.ts';
import { EventId } from '../../utils/EventId.ts';
import { reduceV5 } from '../JoinReducer.ts';
import WarpState from './WarpState.ts';
import { encodeEdgeKey, encodePropKey } from '../KeyCodec.js';
import type { PropValue } from '../../types/PropValue.ts';
import { ProvenanceIndex } from '../provenance/ProvenanceIndex.js';
import PersistenceError from '../../errors/PersistenceError.ts';
import { isV5CheckpointSchema, partitionTreeOids } from './checkpointHelpers.ts';
import type CommitPort from '../../../ports/CommitPort.ts';
import type BlobPort from '../../../ports/BlobPort.ts';
import type TreePort from '../../../ports/TreePort.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type CheckpointStorePort from '../../../ports/CheckpointStorePort.ts';
import type Patch from '../../types/Patch.ts';

/** Combined persistence surface needed for checkpoint loading. */
export type LoadPersistence = CommitPort & BlobPort & TreePort;

/** The result of loading a checkpoint. */
export interface LoadedCheckpoint {
  state: WarpState;
  frontier: Map<string, string>;
  stateHash: string;
  schema: number;
  appliedVV: VersionVector | null;
  provenanceIndex?: ProvenanceIndex;
  indexShardOids: Record<string, string> | null;
}

/** Options for loadCheckpoint. */
export interface LoadCheckpointOptions {
  codec?: CodecPort;
  checkpointStore?: CheckpointStorePort;
}

/**
 * Loads a schema:2 checkpoint from a commit SHA.
 *
 * Reads the checkpoint commit, extracts the tree entries,
 * and deserializes the V5 state and frontier.
 *
 * Loads state.cbor as AUTHORITATIVE full ORSet state
 * (NEVER uses visible.cbor for resume - it's cache only)
 *
 * Schema:1 checkpoints are not supported and will throw an error.
 * Use MigrationService to upgrade schema:1 checkpoints first.
 *
 * @throws {PersistenceError} If checkpoint is schema:1 (migration required)
 */
export async function loadCheckpoint(
  persistence: LoadPersistence,
  checkpointSha: string,
  { codec, checkpointStore }: LoadCheckpointOptions = {},
): Promise<LoadedCheckpoint> {
  // 1. Read commit message and decode
  const message = await persistence.showNode(checkpointSha);
  const decoded = decodeCheckpointMessage(message) as { schema: number; stateHash: string; indexOid: string };

  // 2. Reject unsupported schemas - migration required for schema:1
  if (!isV5CheckpointSchema(decoded.schema)) {
    throw new PersistenceError(
      `Checkpoint ${checkpointSha} is schema:${decoded.schema}. ` +
        `Only schema:2, schema:3, and schema:4 checkpoints are supported. Please migrate using MigrationService.`,
      'E_CHECKPOINT_UNSUPPORTED_SCHEMA',
      { context: { checkpointSha, schema: decoded.schema } },
    );
  }

  // Build codec option object once for exactOptionalPropertyTypes compliance
  const loadCodecOpt = codec !== undefined && codec !== null ? { codec } : {};

  // 3. Read tree entries via the indexOid from the message (points to the tree)
  const rawTreeOids = await persistence.readTreeOids(decoded.indexOid);

  // 3b. Partition: entries with 'index/' prefix are bitmap index shards
  const { treeOids, indexShardOids } = partitionTreeOids(rawTreeOids);

  if (checkpointStore !== undefined && checkpointStore !== null) {
    // New collapsed API: one call reads all artifacts
    const cpData = await checkpointStore.readCheckpoint(treeOids);
    const result: LoadedCheckpoint = {
      state: cpData.state,
      frontier: cpData.frontier,
      stateHash: decoded.stateHash, // Authoritative: from commit message, not adapter
      schema: decoded.schema,       // Authoritative: from commit message
      appliedVV: cpData.appliedVV,
      indexShardOids: Object.keys(indexShardOids).length > 0 ? indexShardOids : cpData.indexShardOids,
    };
    if (cpData.provenanceIndex !== null && cpData.provenanceIndex !== undefined) {
      result.provenanceIndex = cpData.provenanceIndex;
    }
    return result;
  }

  // Legacy path: read each blob individually

  // 4. Read frontier.cbor blob
  const frontierOid = treeOids['frontier.cbor'];
  if (frontierOid === undefined) {
    throw new PersistenceError(
      `Checkpoint ${checkpointSha} missing frontier.cbor in tree`,
      'E_CHECKPOINT_MISSING_FRONTIER',
      { context: { checkpointSha } },
    );
  }
  const frontierBuffer = await persistence.readBlob(frontierOid);
  const frontier = deserializeFrontier(frontierBuffer, loadCodecOpt);

  // 5. Read state.cbor blob and deserialize as V5 full state
  const stateOid = treeOids['state.cbor'];
  if (stateOid === undefined) {
    throw new PersistenceError(
      `Checkpoint ${checkpointSha} missing state.cbor in tree`,
      'E_CHECKPOINT_MISSING_STATE',
      { context: { checkpointSha } },
    );
  }
  const stateBuffer = await persistence.readBlob(stateOid);
  // V5: Load AUTHORITATIVE full state from state.cbor (NEVER use visible.cbor for resume)
  const state = deserializeFullState(stateBuffer, loadCodecOpt);

  // Load appliedVV if present
  let appliedVV: VersionVector | null = null;
  const appliedVVOid = treeOids['appliedVV.cbor'];
  if (appliedVVOid !== undefined) {
    const appliedVVBuffer = await persistence.readBlob(appliedVVOid);
    appliedVV = deserializeAppliedVV(appliedVVBuffer, loadCodecOpt);
  }

  // Load provenanceIndex if present (HG/IO/2)
  let provenanceIndex: ProvenanceIndex | null = null;
  const provenanceIndexOid = treeOids['provenanceIndex.cbor'];
  if (provenanceIndexOid !== undefined) {
    const provenanceIndexBuffer = await persistence.readBlob(provenanceIndexOid);
    provenanceIndex = ProvenanceIndex.deserialize(provenanceIndexBuffer, loadCodecOpt);
  }

  const result: LoadedCheckpoint = {
    state,
    frontier,
    stateHash: decoded.stateHash,
    schema: decoded.schema,
    appliedVV,
    indexShardOids: Object.keys(indexShardOids).length > 0 ? indexShardOids : null,
  };
  if (provenanceIndex !== null) {
    result.provenanceIndex = provenanceIndex;
  }
  return result;
}

/** Options for materializeIncremental. */
export interface MaterializeIncrementalOptions {
  persistence: LoadPersistence;
  graphName: string;
  checkpointSha: string;
  targetFrontier: Map<string, string>;
  patchLoader: (
    writerId: string,
    fromSha: string | null,
    toSha: string,
  ) => Promise<Array<{ patch: Patch; sha: string }>>;
  codec?: CodecPort;
}

/**
 * Materializes V5 state incrementally from a schema:2 checkpoint.
 *
 * Loads the checkpoint state and frontier, then applies all patches
 * since the checkpoint frontier to reach the target frontier.
 *
 * Only supports schema:2 checkpoints. Schema:1 checkpoints will cause
 * loadCheckpoint to throw an error.
 *
 * @throws {PersistenceError} If checkpoint is schema:1 (migration required)
 * @throws {PersistenceError} If checkpoint is missing required blobs (state.cbor, frontier.cbor)
 */
export async function materializeIncremental({
  persistence,
  graphName: _graphName,
  checkpointSha,
  targetFrontier,
  patchLoader,
  codec,
}: MaterializeIncrementalOptions): Promise<WarpState> {
  // 1. Load checkpoint state and frontier (schema:2 returns full V5 state)
  const loadOpts: LoadCheckpointOptions = codec !== undefined && codec !== null ? { codec } : {};
  const checkpoint = await loadCheckpoint(persistence, checkpointSha, loadOpts);
  const checkpointFrontier = checkpoint.frontier;

  // 2. Use checkpoint state directly (schema:2 stores full V5 state)
  const initialState = checkpoint.state;

  // 3. Collect patches since checkpoint frontier for each writer
  const allPatches: Array<{ patch: Patch; sha: string }> = [];

  for (const [writerId, targetSha] of targetFrontier.entries()) {
    const cpSha = checkpointFrontier.get(writerId);

    // If writer wasn't in checkpoint frontier, load all their patches up to targetSha
    // If writer was in checkpoint, load patches from checkpoint SHA to target SHA
    const patches = await patchLoader(writerId, cpSha ?? null, targetSha);
    allPatches.push(...patches);
  }

  // 4. If no new patches, return the checkpoint state as-is
  if (allPatches.length === 0) {
    return initialState;
  }

  // 5. Apply new patches using V5 reducer with checkpoint state as initial
  const finalState = reduceV5(allPatches, initialState) as WarpState;

  return finalState;
}

/** Visible projection used for reconstructStateFromCheckpoint. */
export interface VisibleProjection {
  nodes: string[];
  edges: Array<{ from: string; to: string; label: string }>;
  props: Array<{ node: string; key: string; value: unknown }>;
}

/**
 * Reconstructs WarpState (ORSet-based) from a checkpoint's visible projection.
 *
 * Creates ORSet-based state with synthetic dots for all visible elements.
 * This is used when loading a v5 checkpoint for incremental materialization.
 */
export function reconstructStateFromCheckpoint(
  visibleProjection: VisibleProjection,
): WarpState {
  const { nodes, edges, props } = visibleProjection;

  // Create a synthetic dot for checkpoint entries
  // Uses a special writerId that won't conflict with real writers
  // Counter starts at 1 (0 is invalid for dots)
  const syntheticDot = Dot.create('__checkpoint__', 1);

  // Create a synthetic EventId for LWW props.
  // lamport=1 is the minimum valid value. Using a deterministic checkpoint
  // EventId means any subsequent real write (lamport >= 1 with a later total
  // order) will supersede checkpoint-loaded props correctly.
  // NOTE: lamport=1 is used here because EventId validates lamport>0. The
  // edgeBirthEvent sentinel below uses lamport=0 (via a structural bypass)
  // which is below all real event lamports, making all props visible.
  const syntheticEventId = new EventId(
    1,
    '__checkpoint__',
    '0000000000000000000000000000000000000000',
    0,
  );

  // Sentinel birthEvent for checkpoint-loaded edges.
  // lamport=0 is below all real EventId lamports (>= 1), so all checkpoint-loaded
  // props pass the visibility filter. EventId constructor disallows lamport=0,
  // so we use a structural bypass here — this is intentional, not a type error.
  const sentinelBirthEvent = { lamport: 0, writerId: '', patchSha: '0000', opIndex: 0 } as unknown as EventId;

  const nodeAlive = ORSet.empty();
  const edgeAlive = ORSet.empty();
  const prop = new Map<string, LWWRegister<PropValue>>();
  const observedFrontier = VersionVector.empty();

  // Reconstruct nodes as ORSet entries
  for (const nodeId of nodes) {
    nodeAlive.add(nodeId, syntheticDot);
  }

  // Reconstruct edges as ORSet entries
  for (const edge of edges) {
    const edgeKey = encodeEdgeKey(edge.from, edge.to, edge.label);
    edgeAlive.add(edgeKey, syntheticDot);
  }

  // Reconstruct props with LWW registers (same as v4)
  for (const p of props) {
    const propKey = encodePropKey(p.node, p.key);
    prop.set(propKey, LWWRegister.set(syntheticEventId, p.value as PropValue));
  }

  // Reconstruct edgeBirthEvent with the lamport=0 sentinel so all
  // checkpoint-loaded props (and any real event with lamport>=1) pass
  // the visibility filter.
  const edgeBirthEvent = new Map<string, EventId>();
  for (const edge of edges) {
    const edgeKey = encodeEdgeKey(edge.from, edge.to, edge.label);
    edgeBirthEvent.set(edgeKey, sentinelBirthEvent);
  }

  return new WarpState({ nodeAlive, edgeAlive, prop, observedFrontier, edgeBirthEvent });
}
