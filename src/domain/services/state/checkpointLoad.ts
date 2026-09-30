/**
 * Checkpoint loading and incremental materialization for WARP.
 *
 * Provides loadCheckpoint, materializeIncremental, and
 * reconstructStateFromCheckpoint.
 *
 * @module domain/services/state/checkpointLoad
 * @see WARP Spec Section 10
 */

import NodeId from '../../graph/NodeId.ts';
import ORSet from '../../crdt/ORSet.ts';
import { Dot } from '../../crdt/Dot.ts';
import VersionVector from '../../crdt/VersionVector.ts';
import { LWWRegister } from '../../crdt/LWW.ts';
import { EventId } from '../../utils/EventId.ts';
import { reducePatches } from '../JoinReducer.ts';
import WarpState from './WarpState.ts';
import { unlessStaleCheckpoint } from './StaleCheckpointMaterialization.ts';
import { encodeEdgeKey, encodePropKey } from '../KeyCodec.ts';
import WarpError from '../../errors/WarpError.ts';
import { isPropValue, type PropValue } from '../../types/PropValue.ts';
import type CodecValue from '../../types/codec/CodecValue.ts';
import type CheckpointStorePort from '../../../ports/CheckpointStorePort.ts';
import type AssetHandle from '../../storage/AssetHandle.ts';
import type BundleHandle from '../../storage/BundleHandle.ts';
import type Patch from '../../types/Patch.ts';
import type { ProvenanceIndex } from '../provenance/ProvenanceIndex.ts';

/** The result of loading a checkpoint. */
export type LoadedCheckpoint = {
  state: WarpState;
  frontier: Map<string, string>;
  stateHash: string;
  schema: number;
  appliedVV: VersionVector | null;
  provenanceIndex?: ProvenanceIndex;
  indexShardHandles: Readonly<Record<string, AssetHandle>> | null;
  indexRoot: BundleHandle | null;
  propertyRoot: BundleHandle | null;
};

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
  checkpointStore: CheckpointStorePort,
  checkpointSha: string,
  expectedGraphName?: string,
): Promise<LoadedCheckpoint> {
  const checkpoint = await checkpointStore.loadCheckpoint(checkpointSha, expectedGraphName);
  return {
    state: checkpoint.state,
    frontier: checkpoint.frontier,
    stateHash: checkpoint.stateHash,
    schema: checkpoint.schema,
    appliedVV: checkpoint.appliedVV,
    indexShardHandles: checkpoint.indexShardHandles,
    indexRoot: checkpoint.indexRoot,
    propertyRoot: checkpoint.propertyRoot,
    ...(checkpoint.provenanceIndex === null || checkpoint.provenanceIndex === undefined
      ? {} : { provenanceIndex: checkpoint.provenanceIndex }),
  };
}

/** Options for materializeIncremental. */
export type MaterializeIncrementalOptions = {
  checkpointStore: CheckpointStorePort;
  graphName: string;
  checkpointSha: string;
  targetFrontier: Map<string, string>;
  patchLoader: (
    writerId: string,
    fromSha: string | null,
    toSha: string,
  ) => Promise<Array<{ patch: Patch; sha: string }>>;
};

/**
 * Materializes state incrementally from a current checkpoint.
 *
 * Loads the checkpoint state and frontier, then applies all patches
 * since the checkpoint frontier to reach the target frontier.
 *
 * Only supports the current checkpoint schema. Retired schemas will cause
 * loadCheckpoint to throw an explicit upgrade error. A checkpoint whose
 * materialization predates the current descriptor schema is not resumed
 * from: its state predates the current visibility rules, so every writer's
 * patches are replayed from the start, as materialize() does.
 *
 * @throws {PersistenceError} If checkpoint is a retired schema (upgrade required)
 * @throws {PersistenceError} If checkpoint is missing required envelope blobs
 */
export async function materializeIncremental({
  checkpointStore,
  graphName,
  checkpointSha,
  targetFrontier,
  patchLoader,
}: MaterializeIncrementalOptions): Promise<WarpState> {
  const checkpoint = await unlessStaleCheckpoint(loadCheckpoint(checkpointStore, checkpointSha, graphName));
  const checkpointFrontier = checkpoint?.frontier ?? new Map<string, string>();

  // 2. Use checkpoint state directly, or start empty for a stale checkpoint.
  const initialState = checkpoint?.state ?? WarpState.empty();

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
export type VisibleProjection = {
  nodes: string[];
  edges: Array<{ from: string; to: string; label: string }>;
  props: Array<{ node: string; key: string; value: CodecValue }>;
};

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
  const syntheticEventId = new EventId(
    1,
    '__checkpoint__',
    '0000000000000000000000000000000000000000',
    0,
  );

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
    const owner = requireNodeOwnedProperty(p.node, p.key);
    const propKey = encodePropKey(owner.toString(), p.key);
    prop.set(propKey, LWWRegister.set(syntheticEventId, requireCheckpointPropertyValue(p.value)));
  }

  // Visible projections carry no lifecycle witnesses; leave birth maps empty.
  return new WarpState({ nodeAlive, edgeAlive, prop, observedFrontier });
}

/**
 * Refuses a checkpoint property whose owner is not a node id.
 *
 * The visible projection carries node properties only — `projectState` fills
 * `props[].node` from node property entries, skipping every edge-owned key —
 * so an empty owner, an owner containing NUL, or one bearing the reserved
 * edge-property prefix is not a valid NodeId. Encoding it anyway would produce a key that later reads classify as
 * edge-owned but that carries the wrong field count, turning one bad row into
 * an unreadable property.
 *
 * Rejecting here is safe precisely because the shape is unwritable: it can
 * only appear through corruption, truncation, or a foreign writer, never
 * through a checkpoint this library produced.
 */
function requireNodeOwnedProperty(node: string, key: string): NodeId {
  try {
    return new NodeId(node);
  } catch (error) {
    if (!(error instanceof WarpError) || error.code !== 'E_VALIDATION') {
      throw error;
    }
    throw new WarpError(
      'Checkpoint property owner is not a valid node id',
      'E_CHECKPOINT_INVALID_PROP_OWNER',
      { context: { key } },
    );
  }
}

function requireCheckpointPropertyValue(value: CodecValue): PropValue {
  if (!isPropValue(value)) {
    throw new WarpError('Checkpoint property value is invalid', 'E_CHECKPOINT_INVALID_PROP_VALUE');
  }
  return value;
}
