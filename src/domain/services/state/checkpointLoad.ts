/**
 * Checkpoint loading and incremental materialization for WARP.
 *
 * Provides loadCheckpoint, materializeIncremental, and
 * reconstructStateFromCheckpoint.
 *
 * @module domain/services/state/checkpointLoad
 * @see WARP Spec Section 10
 */

import ORSet from '../../crdt/ORSet.ts';
import { Dot } from '../../crdt/Dot.ts';
import VersionVector from '../../crdt/VersionVector.ts';
import { LWWRegister } from '../../crdt/LWW.ts';
import { EventId } from '../../utils/EventId.ts';
import { reducePatches } from '../JoinReducer.ts';
import WarpState from './WarpState.ts';
import { encodeEdgeKey, encodePropKey } from '../KeyCodec.ts';
import type { PropValue } from '../../types/PropValue.ts';
import type CheckpointStorePort from '../../../ports/CheckpointStorePort.ts';
import type AssetHandle from '../../storage/AssetHandle.ts';
import type Patch from '../../types/Patch.ts';
import type { ProvenanceIndex } from '../provenance/ProvenanceIndex.ts';

/** The result of loading a checkpoint. */
export interface LoadedCheckpoint {
  state: WarpState;
  frontier: Map<string, string>;
  stateHash: string;
  schema: number;
  appliedVV: VersionVector | null;
  provenanceIndex?: ProvenanceIndex;
  indexShardHandles: Readonly<Record<string, AssetHandle>> | null;
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
  checkpointStore: CheckpointStorePort,
  checkpointSha: string,
  expectedGraphName?: string,
): Promise<LoadedCheckpoint> {
  const checkpoint = await checkpointStore.loadCheckpoint(checkpointSha, expectedGraphName);
  const result: LoadedCheckpoint = {
    state: checkpoint.state,
    frontier: checkpoint.frontier,
    stateHash: checkpoint.stateHash,
    schema: checkpoint.schema,
    appliedVV: checkpoint.appliedVV,
    indexShardHandles: checkpoint.indexShardHandles,
  };
  if (checkpoint.provenanceIndex !== null && checkpoint.provenanceIndex !== undefined) {
    result.provenanceIndex = checkpoint.provenanceIndex;
  }
  return result;
}

/** Options for materializeIncremental. */
export interface MaterializeIncrementalOptions {
  checkpointStore: CheckpointStorePort;
  graphName: string;
  checkpointSha: string;
  targetFrontier: Map<string, string>;
  patchLoader: (
    writerId: string,
    fromSha: string | null,
    toSha: string,
  ) => Promise<Array<{ patch: Patch; sha: string }>>;
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
  checkpointStore,
  graphName,
  checkpointSha,
  targetFrontier,
  patchLoader,
}: MaterializeIncrementalOptions): Promise<WarpState> {
  const checkpoint = await loadCheckpoint(checkpointStore, checkpointSha, graphName);
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
