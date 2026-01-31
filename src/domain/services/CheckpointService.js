/**
 * Checkpoint Service for WARP multi-writer graph database.
 *
 * Provides functionality for creating and loading checkpoints,
 * as well as incremental state materialization from checkpoints.
 *
 * @module CheckpointService
 * @see WARP Spec Section 10
 */

import { serializeState, computeStateHash, deserializeState } from './StateSerializer.js';
import { serializeStateV5, computeStateHashV5, deserializeStateV5 } from './StateSerializerV5.js';
import {
  serializeFullStateV5,
  deserializeFullStateV5,
  computeAppliedVV,
  serializeAppliedVV,
  deserializeAppliedVV,
} from './CheckpointSerializerV5.js';
import { serializeFrontier, deserializeFrontier } from './Frontier.js';
import { encodeCheckpointMessage, decodeCheckpointMessage } from './WarpMessageCodec.js';
import { reduce } from './Reducer.js';
import { createORSet, orsetAdd, orsetCompact } from '../crdt/ORSet.js';
import { createDot, encodeDot } from '../crdt/Dot.js';
import { createVersionVector } from '../crdt/VersionVector.js';
import { encodeEdgeKey, encodePropKey, cloneStateV5 } from './JoinReducer.js';

// ============================================================================
// Checkpoint Creation (WARP spec Section 10)
// ============================================================================

/**
 * Creates a checkpoint commit containing serialized state and frontier.
 *
 * For schema 1 (V4), the tree structure is:
 * ```
 * <checkpoint_commit_tree>/
 * ├── state.cbor           # Canonical state (visible projection)
 * ├── frontier.cbor        # Writer frontiers
 * └── index/               # (skipped for now)
 * ```
 *
 * For schema 2 (V5), the tree structure is:
 * ```
 * <checkpoint_commit_tree>/
 * ├── state.cbor           # AUTHORITATIVE: Full V5 state (ORSets + props)
 * ├── visible.cbor         # CACHE ONLY: Visible projection for fast queries
 * ├── frontier.cbor        # Writer frontiers
 * └── appliedVV.cbor       # Version vector of dots in state
 * ```
 *
 * @param {Object} options - Checkpoint creation options
 * @param {import('../../infrastructure/adapters/GitGraphAdapter.js').default} options.persistence - Git persistence adapter
 * @param {string} options.graphName - Name of the graph
 * @param {import('./Reducer.js').WarpState|import('./JoinReducer.js').WarpStateV5} options.state - The materialized state to checkpoint
 * @param {import('./Frontier.js').Frontier} options.frontier - Writer frontier map
 * @param {string[]} [options.parents=[]] - Parent commit SHAs (typically prior checkpoint or patch commits)
 * @param {number} [options.schema=1] - Schema version (1 for V4, 2 for V5)
 * @param {boolean} [options.compact=true] - For schema 2: whether to compact tombstoned dots before saving
 * @returns {Promise<string>} The checkpoint commit SHA
 */
export async function create({ persistence, graphName, state, frontier, parents = [], schema = 1, compact = true }) {
  if (schema === 2) {
    return createV5({ persistence, graphName, state, frontier, parents, compact });
  }

  // Schema 1 (V4) checkpoint creation
  // 1. Serialize state to CBOR and compute hash
  const stateBuffer = serializeState(state);
  const stateHash = computeStateHash(state);

  // 2. Serialize frontier to CBOR
  const frontierBuffer = serializeFrontier(frontier);

  // 3. Write blobs to git
  const stateBlobOid = await persistence.writeBlob(stateBuffer);
  const frontierBlobOid = await persistence.writeBlob(frontierBuffer);

  // 4. Create tree with state.cbor and frontier.cbor
  // Tree entry format: "mode type oid\tfilename"
  // For blobs: "100644 blob <oid>\t<filename>"
  const treeEntries = [
    `100644 blob ${frontierBlobOid}\tfrontier.cbor`,
    `100644 blob ${stateBlobOid}\tstate.cbor`,
  ];

  // Sort entries by filename for deterministic tree (git requires sorted entries by path)
  treeEntries.sort((a, b) => {
    const filenameA = a.split('\t')[1];
    const filenameB = b.split('\t')[1];
    return filenameA.localeCompare(filenameB);
  });

  const treeOid = await persistence.writeTree(treeEntries);

  // 5. Create checkpoint commit message
  const message = encodeCheckpointMessage({
    graph: graphName,
    stateHash,
    frontierOid: frontierBlobOid,
    indexOid: treeOid, // Using tree OID as index OID for now
    schema,
  });

  // 6. Create the checkpoint commit
  const checkpointSha = await persistence.commitNodeWithTree({
    treeOid,
    parents,
    message,
  });

  return checkpointSha;
}

/**
 * Creates a V5 checkpoint commit with full ORSet state.
 *
 * V5 Checkpoint Tree Structure:
 * ```
 * <checkpoint_tree>/
 * ├── state.cbor           # AUTHORITATIVE: Full V5 state (ORSets + props)
 * ├── visible.cbor         # CACHE ONLY: Visible projection for fast queries
 * ├── frontier.cbor        # Writer frontiers
 * └── appliedVV.cbor       # Version vector of dots in state
 * ```
 *
 * @param {Object} options - Checkpoint creation options
 * @param {import('../../infrastructure/adapters/GitGraphAdapter.js').default} options.persistence - Git persistence adapter
 * @param {string} options.graphName - Name of the graph
 * @param {import('./JoinReducer.js').WarpStateV5} options.state - The V5 state to checkpoint
 * @param {import('./Frontier.js').Frontier} options.frontier - Writer frontier map
 * @param {string[]} [options.parents=[]] - Parent commit SHAs
 * @param {boolean} [options.compact=true] - Whether to compact tombstoned dots before saving
 * @returns {Promise<string>} The checkpoint commit SHA
 */
export async function createV5({
  persistence,
  graphName,
  state,
  frontier,
  parents = [],
  compact = true,
}) {
  // 1. Compute appliedVV from actual state dots
  const appliedVV = computeAppliedVV(state);

  // 2. Optionally compact (only tombstoned dots <= appliedVV)
  let checkpointState = state;
  if (compact) {
    checkpointState = cloneStateV5(state);
    orsetCompact(checkpointState.nodeAlive, appliedVV);
    orsetCompact(checkpointState.edgeAlive, appliedVV);
  }

  // 3. Serialize full state (AUTHORITATIVE)
  const stateBuffer = serializeFullStateV5(checkpointState);

  // 4. Serialize visible projection (CACHE)
  const visibleBuffer = serializeStateV5(checkpointState);
  const stateHash = computeStateHashV5(checkpointState);

  // 5. Serialize frontier and appliedVV
  const frontierBuffer = serializeFrontier(frontier);
  const appliedVVBuffer = serializeAppliedVV(appliedVV);

  // 6. Write blobs to git
  const stateBlobOid = await persistence.writeBlob(stateBuffer);
  const visibleBlobOid = await persistence.writeBlob(visibleBuffer);
  const frontierBlobOid = await persistence.writeBlob(frontierBuffer);
  const appliedVVBlobOid = await persistence.writeBlob(appliedVVBuffer);

  // 7. Create tree with sorted entries
  const treeEntries = [
    `100644 blob ${appliedVVBlobOid}\tappliedVV.cbor`,
    `100644 blob ${frontierBlobOid}\tfrontier.cbor`,
    `100644 blob ${stateBlobOid}\tstate.cbor`,
    `100644 blob ${visibleBlobOid}\tvisible.cbor`,
  ];

  // Sort entries by filename for deterministic tree (git requires sorted entries by path)
  treeEntries.sort((a, b) => {
    const filenameA = a.split('\t')[1];
    const filenameB = b.split('\t')[1];
    return filenameA.localeCompare(filenameB);
  });

  const treeOid = await persistence.writeTree(treeEntries);

  // 8. Create checkpoint commit message with v5 trailer
  const message = encodeCheckpointMessage({
    graph: graphName,
    stateHash,
    frontierOid: frontierBlobOid,
    indexOid: treeOid,
    schema: 2,
  });

  // 9. Create the checkpoint commit
  const checkpointSha = await persistence.commitNodeWithTree({
    treeOid,
    parents,
    message,
  });

  return checkpointSha;
}

// ============================================================================
// Checkpoint Loading
// ============================================================================

/**
 * Loads a checkpoint from a commit SHA.
 *
 * Reads the checkpoint commit, extracts the tree entries,
 * and deserializes the state and frontier.
 *
 * For schema 1 (V4): Loads state.cbor as visible projection
 * For schema 2 (V5): Loads state.cbor as AUTHORITATIVE full ORSet state
 *                   (NEVER uses visible.cbor for resume - it's cache only)
 *
 * @param {import('../../infrastructure/adapters/GitGraphAdapter.js').default} persistence - Git persistence adapter
 * @param {string} checkpointSha - The checkpoint commit SHA to load
 * @returns {Promise<{state: Object, frontier: import('./Frontier.js').Frontier, stateHash: string, schema: number, appliedVV?: Map<string, number>}>} The loaded checkpoint data
 */
export async function loadCheckpoint(persistence, checkpointSha) {
  // 1. Read commit message and decode
  const message = await persistence.showNode(checkpointSha);
  const decoded = decodeCheckpointMessage(message);

  // 2. Get commit info to extract tree OID
  const commitInfo = await persistence.getNodeInfo(checkpointSha);

  // The tree is attached to the commit - we need to parse the commit
  // Since getNodeInfo doesn't give us tree OID, we read the tree entries
  // via the indexOid from the message (which points to the tree)
  const treeOids = await persistence.readTreeOids(decoded.indexOid);

  // 3. Read frontier.cbor blob
  const frontierOid = treeOids['frontier.cbor'];
  if (!frontierOid) {
    throw new Error(`Checkpoint ${checkpointSha} missing frontier.cbor in tree`);
  }
  const frontierBuffer = await persistence.readBlob(frontierOid);
  const frontier = deserializeFrontier(frontierBuffer);

  // 4. Read state.cbor blob and deserialize based on schema
  const stateOid = treeOids['state.cbor'];
  if (!stateOid) {
    throw new Error(`Checkpoint ${checkpointSha} missing state.cbor in tree`);
  }
  const stateBuffer = await persistence.readBlob(stateOid);

  // Use appropriate deserializer based on schema version
  if (decoded.schema === 2) {
    // V5: Load AUTHORITATIVE full state from state.cbor (NEVER use visible.cbor for resume)
    const state = deserializeFullStateV5(stateBuffer);

    // Load appliedVV if present
    let appliedVV = null;
    const appliedVVOid = treeOids['appliedVV.cbor'];
    if (appliedVVOid) {
      const appliedVVBuffer = await persistence.readBlob(appliedVVOid);
      appliedVV = deserializeAppliedVV(appliedVVBuffer);
    }

    return {
      state,
      frontier,
      stateHash: decoded.stateHash,
      schema: decoded.schema,
      appliedVV,
    };
  } else {
    // V4: Load visible projection
    const state = deserializeState(stateBuffer);

    return {
      state,
      frontier,
      stateHash: decoded.stateHash,
      schema: decoded.schema,
    };
  }
}

// ============================================================================
// Incremental Materialization
// ============================================================================

/**
 * Materializes state incrementally from a checkpoint.
 *
 * Loads the checkpoint state and frontier, then applies all patches
 * since the checkpoint frontier to reach the target frontier.
 *
 * @param {Object} options - Materialization options
 * @param {import('../../infrastructure/adapters/GitGraphAdapter.js').default} options.persistence - Git persistence adapter
 * @param {string} options.graphName - Name of the graph
 * @param {string} options.checkpointSha - The checkpoint commit SHA to start from
 * @param {import('./Frontier.js').Frontier} options.targetFrontier - The target frontier to materialize to
 * @param {Function} options.patchLoader - Async function to load patches: (writerId, fromSha, toSha) => Array<{patch, sha}>
 * @returns {Promise<import('./Reducer.js').WarpState>} The materialized state at targetFrontier
 */
export async function materializeIncremental({ persistence, graphName, checkpointSha, targetFrontier, patchLoader }) {
  // 1. Load checkpoint state and frontier
  const checkpoint = await loadCheckpoint(persistence, checkpointSha);
  const checkpointFrontier = checkpoint.frontier;

  // 2. Reconstruct initial state from checkpoint
  // The checkpoint.state is the visible projection (nodes, edges, props arrays)
  // For incremental reduce, we need to convert this back to WarpState format
  // Note: This is a simplified reconstruction - in production, the checkpoint
  // might store the full WarpState directly
  const initialState = reconstructStateFromCheckpoint(checkpoint.state);

  // 3. Collect patches since checkpoint frontier for each writer
  const allPatches = [];

  for (const [writerId, targetSha] of targetFrontier) {
    const checkpointSha = checkpointFrontier.get(writerId);

    // If writer wasn't in checkpoint frontier, load all their patches up to targetSha
    // If writer was in checkpoint, load patches from checkpoint SHA to target SHA
    const patches = await patchLoader(writerId, checkpointSha || null, targetSha);
    allPatches.push(...patches);
  }

  // 4. If no new patches, return the checkpoint state as-is
  if (allPatches.length === 0) {
    return initialState;
  }

  // 5. Apply new patches using reduce with checkpoint state as initial
  const finalState = reduce(allPatches, initialState);

  return finalState;
}

/**
 * Reconstructs WarpState from a checkpoint's visible projection.
 *
 * The checkpoint stores the visible projection (nodes, edges, props arrays).
 * This reconstructs a WarpState with LWW registers for each entry.
 * Note: This creates synthetic eventIds since the checkpoint doesn't preserve them.
 *
 * @param {Object} checkpointState - The checkpoint's visible projection
 * @param {string[]} checkpointState.nodes - Visible node IDs
 * @param {Array<{from: string, to: string, label: string}>} checkpointState.edges - Visible edges
 * @param {Array<{node: string, key: string, value: *}>} checkpointState.props - Visible properties
 * @returns {import('./Reducer.js').WarpState} Reconstructed WarpState
 * @private
 */
function reconstructStateFromCheckpoint(checkpointState) {
  const { nodes, edges, props } = checkpointState;

  // Create a synthetic eventId for checkpoint entries
  // These will be overwritten by any real operations with later timestamps
  const syntheticEventId = {
    lamport: 0,
    writerId: '__checkpoint__',
    patchSha: '0000000000000000000000000000000000000000',
    opIndex: 0,
  };

  const nodeAlive = new Map();
  const edgeAlive = new Map();
  const prop = new Map();

  // Reconstruct nodes
  for (const nodeId of nodes) {
    nodeAlive.set(nodeId, {
      eventId: syntheticEventId,
      value: true,
    });
  }

  // Reconstruct edges
  for (const edge of edges) {
    const edgeKey = `${edge.from}\0${edge.to}\0${edge.label}`;
    edgeAlive.set(edgeKey, {
      eventId: syntheticEventId,
      value: true,
    });
  }

  // Reconstruct props
  for (const p of props) {
    const propKey = `${p.node}\0${p.key}`;
    prop.set(propKey, {
      eventId: syntheticEventId,
      value: p.value,
    });
  }

  return { nodeAlive, edgeAlive, prop };
}

/**
 * Reconstructs WarpStateV5 (ORSet-based) from a checkpoint's visible projection.
 *
 * Creates ORSet-based state with synthetic dots for all visible elements.
 * This is used when loading a v5 checkpoint for incremental materialization.
 *
 * @param {Object} visibleProjection - The checkpoint's visible projection
 * @param {string[]} visibleProjection.nodes - Visible node IDs
 * @param {Array<{from: string, to: string, label: string}>} visibleProjection.edges - Visible edges
 * @param {Array<{node: string, key: string, value: *}>} visibleProjection.props - Visible properties
 * @returns {import('./JoinReducer.js').WarpStateV5} Reconstructed WarpStateV5
 * @public
 */
export function reconstructStateV5FromCheckpoint(visibleProjection) {
  const { nodes, edges, props } = visibleProjection;

  // Create a synthetic dot for checkpoint entries
  // Uses a special writerId that won't conflict with real writers
  // Counter starts at 1 (0 is invalid for dots)
  const syntheticDot = createDot('__checkpoint__', 1);

  // Create a synthetic eventId for LWW props
  const syntheticEventId = {
    lamport: 0,
    writerId: '__checkpoint__',
    patchSha: '0000000000000000000000000000000000000000',
    opIndex: 0,
  };

  const nodeAlive = createORSet();
  const edgeAlive = createORSet();
  const prop = new Map();
  const observedFrontier = createVersionVector();

  // Reconstruct nodes as ORSet entries
  for (const nodeId of nodes) {
    orsetAdd(nodeAlive, nodeId, syntheticDot);
  }

  // Reconstruct edges as ORSet entries
  for (const edge of edges) {
    const edgeKey = encodeEdgeKey(edge.from, edge.to, edge.label);
    orsetAdd(edgeAlive, edgeKey, syntheticDot);
  }

  // Reconstruct props with LWW registers (same as v4)
  for (const p of props) {
    const propKey = encodePropKey(p.node, p.key);
    prop.set(propKey, {
      eventId: syntheticEventId,
      value: p.value,
    });
  }

  return { nodeAlive, edgeAlive, prop, observedFrontier };
}
