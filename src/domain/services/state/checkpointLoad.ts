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
  deserializeAppliedVV,
  deserializeCheckpointStateEnvelope,
  type CheckpointStateEnvelopeBuffers,
} from './CheckpointSerializer.ts';
import { deserializeFrontier } from '../Frontier.ts';
import { requireCommitMessageCodec } from '../codec/CommitMessageCodecRequirement.ts';
import ORSet from '../../crdt/ORSet.ts';
import { Dot } from '../../crdt/Dot.ts';
import VersionVector from '../../crdt/VersionVector.ts';
import { LWWRegister } from '../../crdt/LWW.ts';
import { EventId } from '../../utils/EventId.ts';
import { reducePatches } from '../JoinReducer.ts';
import WarpState from './WarpState.ts';
import { encodeEdgeKey, encodePropKey } from '../KeyCodec.ts';
import type { PropValue } from '../../types/PropValue.ts';
import { ProvenanceIndex } from '../provenance/ProvenanceIndex.ts';
import PersistenceError from '../../errors/PersistenceError.ts';
import {
  CURRENT_CHECKPOINT_SCHEMA,
  isCurrentCheckpointSchema,
  partitionTreeOids,
} from './checkpointHelpers.ts';
import type CommitPort from '../../../ports/CommitPort.ts';
import type BlobPort from '../../../ports/BlobPort.ts';
import type TreePort from '../../../ports/TreePort.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type CommitMessageCodecPort from '../../../ports/CommitMessageCodecPort.ts';
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
  commitMessageCodec: CommitMessageCodecPort;
}

/**
 * Loads a current checkpoint from a commit SHA.
 *
 * Reads the checkpoint commit, extracts the tree entries,
 * and deserializes the current state and frontier.
 *
 * Loads the current state envelope as AUTHORITATIVE ORSet state.
 *
 * Retired schemas are not supported by shipped runtime and will throw an
 * explicit upgrade error.
 *
 * @throws {PersistenceError} If checkpoint schema is unsupported
 */
export async function loadCheckpoint(
  persistence: LoadPersistence,
  checkpointSha: string,
  { codec, checkpointStore, commitMessageCodec }: LoadCheckpointOptions,
): Promise<LoadedCheckpoint> {
  // 1. Read commit message and decode
  const messageCodec = requireCommitMessageCodec(commitMessageCodec);
  const message = await persistence.showNode(checkpointSha);
  const decoded = messageCodec.decodeCheckpoint(message);

  // 2. Reject unsupported schemas; migration tooling owns retired readers.
  if (!isCurrentCheckpointSchema(decoded.schema)) {
    throw unsupportedCheckpointSchema(checkpointSha, decoded.schema);
  }

  // Build codec option object once for exactOptionalPropertyTypes compliance
  const loadCodecOpt = codec !== undefined && codec !== null ? { codec } : {};

  // 3. Read tree entries via the indexOid from the message (points to the tree)
  const rawTreeOids = await persistence.readTreeOids(decoded.indexOid);

  // 3b. Partition: entries with 'index/' prefix are bitmap index shards
  const partitionedTree = partitionTreeOids(rawTreeOids);
  const treeOids = await expandCheckpointStateSubtree(persistence, partitionedTree.treeOids);
  const indexShardOids = await expandCheckpointIndexSubtree(
    persistence,
    treeOids,
    partitionedTree.indexShardOids,
  );

  if (checkpointStore !== undefined && checkpointStore !== null) {
    const checkpoint = await checkpointStore.readCheckpoint(treeOids);
    const result: LoadedCheckpoint = {
      state: checkpoint.state,
      frontier: checkpoint.frontier,
      stateHash: decoded.stateHash,
      schema: decoded.schema,
      appliedVV: checkpoint.appliedVV,
      indexShardOids: Object.keys(indexShardOids).length > 0
        ? indexShardOids
        : checkpoint.indexShardOids,
    };
    if (checkpoint.provenanceIndex !== null && checkpoint.provenanceIndex !== undefined) {
      result.provenanceIndex = checkpoint.provenanceIndex;
    }
    return result;
  }

  // Current path: read each envelope blob individually.
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

  const state = deserializeCheckpointStateEnvelope(
    await readCheckpointStateEnvelope(persistence, checkpointSha, treeOids),
    loadCodecOpt,
  );

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

function unsupportedCheckpointSchema(checkpointSha: string, schema: number): PersistenceError {
  return new PersistenceError(
    `Checkpoint ${checkpointSha} is schema:${schema}. ` +
      `Only schema:${CURRENT_CHECKPOINT_SCHEMA} checkpoints are supported by the shipped runtime. ` +
      'Run `npm run upgrade -- --graph <name>` before loading this graph.',
    'E_CHECKPOINT_UNSUPPORTED_SCHEMA',
    { context: { checkpointSha, schema } },
  );
}

async function readCheckpointStateEnvelope(
  persistence: LoadPersistence,
  checkpointSha: string,
  treeOids: Record<string, string>,
): Promise<CheckpointStateEnvelopeBuffers> {
  return {
    nodeAlive: await persistence.readBlob(requireCheckpointTreeOid(checkpointSha, treeOids, 'state/nodeAlive')),
    edgeAlive: await persistence.readBlob(requireCheckpointTreeOid(checkpointSha, treeOids, 'state/edgeAlive')),
    prop: await persistence.readBlob(requireCheckpointTreeOid(checkpointSha, treeOids, 'state/prop.cbor')),
    observedFrontier: await persistence.readBlob(requireCheckpointTreeOid(checkpointSha, treeOids, 'state/observedFrontier.cbor')),
    edgeBirthEvent: await persistence.readBlob(requireCheckpointTreeOid(checkpointSha, treeOids, 'state/edgeBirthEvent.cbor')),
  };
}

async function expandCheckpointStateSubtree(
  persistence: LoadPersistence,
  treeOids: Record<string, string>,
): Promise<Record<string, string>> {
  if (treeOids['state/nodeAlive'] !== undefined || treeOids['state'] === undefined) {
    return treeOids;
  }

  const stateTreeOid = treeOids['state'];
  const stateTreeOids = await persistence.readTreeOids(stateTreeOid);
  const expanded = { ...treeOids };
  for (const [path, oid] of Object.entries(stateTreeOids)) {
    expanded[`state/${path}`] = oid;
  }
  return expanded;
}

async function expandCheckpointIndexSubtree(
  persistence: LoadPersistence,
  treeOids: Record<string, string>,
  indexShardOids: Record<string, string>,
): Promise<Record<string, string>> {
  if (Object.keys(indexShardOids).length > 0 || treeOids['index'] === undefined) {
    return indexShardOids;
  }

  return await persistence.readTreeOids(treeOids['index']);
}

function requireCheckpointTreeOid(
  checkpointSha: string,
  treeOids: Record<string, string>,
  path: string,
): string {
  const oid = treeOids[path];
  if (oid !== undefined) {
    return oid;
  }
  throw new PersistenceError(
    `Checkpoint ${checkpointSha} missing ${path} in tree`,
    'E_CHECKPOINT_MISSING_STATE',
    { context: { checkpointSha, path } },
  );
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
  commitMessageCodec: CommitMessageCodecPort;
}

/**
 * Materializes state incrementally from a current checkpoint.
 *
 * Loads the checkpoint state and frontier, then applies all patches
 * since the checkpoint frontier to reach the target frontier.
 *
 * Only supports the current checkpoint schema. Retired schemas will cause
 * loadCheckpoint to throw an explicit upgrade error.
 *
 * @throws {PersistenceError} If checkpoint is a retired schema (upgrade required)
 * @throws {PersistenceError} If checkpoint is missing required envelope blobs
 */
export async function materializeIncremental({
  persistence,
  graphName: _graphName,
  checkpointSha,
  targetFrontier,
  patchLoader,
  codec,
  commitMessageCodec,
}: MaterializeIncrementalOptions): Promise<WarpState> {
  // 1. Load checkpoint state and frontier from the current envelope.
  const loadOpts: LoadCheckpointOptions = {
    ...(codec !== undefined && codec !== null ? { codec } : {}),
    commitMessageCodec,
  };
  const checkpoint = await loadCheckpoint(persistence, checkpointSha, loadOpts);
  const checkpointFrontier = checkpoint.frontier;

  // 2. Use checkpoint state directly.
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

  // 5. Apply new patches using the reducer with checkpoint state as initial
  const finalState = reducePatches(allPatches, initialState);

  return finalState;
}

/** Visible projection used for reconstructStateFromCheckpoint. */
export interface VisibleProjection {
  nodes: string[];
  edges: Array<{ from: string; to: string; label: string }>;
  props: Array<{ node: string; key: string; value: unknown }>; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
}

/**
 * Reconstructs WarpState (ORSet-based) from a checkpoint's visible projection.
 *
 * Creates ORSet-based state with synthetic dots for all visible elements.
 * This is used when reconstructing an incremental materialization basis.
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
  const sentinelBirthEvent = { lamport: 0, writerId: '', patchSha: '0000', opIndex: 0 } as unknown as EventId; // nosemgrep: ts-no-double-cast -- 0025A; nosemgrep: ts-no-unknown-outside-adapters -- 0025B

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

  // Reconstruct props with LWW registers matching the legacy checkpoint shape.
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
