/**
 * PatchBuilderV2 - Fluent API for building WARP v5 (schema:2) patches.
 *
 * Key differences from PatchBuilder:
 * 1. Maintains a VersionVector per writer
 * 2. Assigns dots on add operations using vvIncrement
 * 3. Reads current state to populate observedDots for removes
 * 4. Includes context VersionVector in patch
 *
 * @module domain/services/PatchBuilderV2
 * @see WARP v5 Spec
 */

import { vvIncrement, vvClone, vvSerialize } from '../crdt/VersionVector.js';
import { orsetGetDots, orsetContains, orsetElements } from '../crdt/ORSet.js';
import {
  createNodeAddV2,
  createNodeRemoveV2,
  createEdgeAddV2,
  createEdgeRemoveV2,
  createPropSetV2,
  createPatchV2,
} from '../types/WarpTypesV2.js';
import { encodeEdgeKey, EDGE_PROP_PREFIX } from './JoinReducer.js';
import { encode } from '../../infrastructure/codecs/CborCodec.js';
import { encodePatchMessage, decodePatchMessage } from './WarpMessageCodec.js';
import { buildWriterRef } from '../utils/RefLayout.js';
import { WriterError } from '../warp/Writer.js';

/**
 * Inspects materialized state for edges and properties attached to a node.
 *
 * @param {import('./JoinReducer.js').WarpStateV5} state - Materialized state
 * @param {string} nodeId - Node to inspect
 * @returns {{ edges: string[], props: string[], hasData: boolean }}
 */
function findAttachedData(state, nodeId) {
  const edges = [];
  const props = [];

  for (const key of orsetElements(state.edgeAlive)) {
    const parts = key.split('\0');
    if (parts[0] === nodeId || parts[1] === nodeId) {
      edges.push(key);
    }
  }

  const propPrefix = `${nodeId}\0`;
  for (const key of state.prop.keys()) {
    if (key.startsWith(propPrefix)) {
      props.push(key);
    }
  }

  return { edges, props, hasData: edges.length > 0 || props.length > 0 };
}

/**
 * Fluent builder for creating WARP v5 patches with dots and observed-remove semantics.
 */
export class PatchBuilderV2 {
  /**
   * Creates a new PatchBuilderV2.
   *
   * @param {Object} options
   * @param {import('../../ports/GraphPersistencePort.js').default} options.persistence - Git adapter
   * @param {string} options.graphName - Graph namespace
   * @param {string} options.writerId - This writer's ID
   * @param {number} options.lamport - Lamport timestamp for this patch
   * @param {import('../crdt/VersionVector.js').VersionVector} options.versionVector - Current version vector
   * @param {Function} options.getCurrentState - Function that returns the current materialized state
   * @param {string|null} [options.expectedParentSha] - Expected parent SHA for race detection
   * @param {Function|null} [options.onCommitSuccess] - Callback invoked after successful commit
   * @param {'reject'|'cascade'|'warn'} [options.onDeleteWithData='warn'] - Policy when deleting a node with attached data
   */
  constructor({ persistence, graphName, writerId, lamport, versionVector, getCurrentState, expectedParentSha = null, onCommitSuccess = null, onDeleteWithData = 'warn' }) {
    /** @type {import('../../ports/GraphPersistencePort.js').default} */
    this._persistence = persistence;

    /** @type {string} */
    this._graphName = graphName;

    /** @type {string} */
    this._writerId = writerId;

    /** @type {number} */
    this._lamport = lamport;

    /** @type {import('../crdt/VersionVector.js').VersionVector} */
    this._vv = vvClone(versionVector); // Clone to track local increments

    /** @type {Function} */
    this._getCurrentState = getCurrentState; // Function to get current materialized state

    /** @type {string|null} */
    this._expectedParentSha = expectedParentSha;

    /** @type {Function|null} */
    this._onCommitSuccess = onCommitSuccess;

    /** @type {import('../types/WarpTypesV2.js').OpV2[]} */
    this._ops = [];

    /** @type {Set<string>} Edge keys added in this patch (for setEdgeProperty validation) */
    this._edgesAdded = new Set();

    /** @type {'reject'|'cascade'|'warn'} */
    this._onDeleteWithData = onDeleteWithData;
  }

  /**
   * Adds a node to the graph.
   * Generates a new dot using vvIncrement.
   *
   * @param {string} nodeId - The node ID to add
   * @returns {PatchBuilderV2} This builder for chaining
   *
   * @example
   * builder.addNode('user:alice');
   */
  addNode(nodeId) {
    const dot = vvIncrement(this._vv, this._writerId);
    this._ops.push(createNodeAddV2(nodeId, dot));
    return this;
  }

  /**
   * Removes a node from the graph.
   * Reads observed dots from current state to enable proper OR-Set removal.
   *
   * @param {string} nodeId - The node ID to remove
   * @returns {PatchBuilderV2} This builder for chaining
   *
   * @example
   * builder.removeNode('user:alice');
   */
  removeNode(nodeId) {
    // Get observed dots from current state (orsetGetDots returns already-encoded dot strings)
    const state = this._getCurrentState();

    // Cascade mode: auto-generate EdgeRemove ops for all connected edges before NodeRemove.
    // Generated ops appear in the patch for auditability.
    if (this._onDeleteWithData === 'cascade' && state) {
      const { edges } = findAttachedData(state, nodeId);
      for (const edgeKey of edges) {
        const [from, to, label] = edgeKey.split('\0');
        const edgeDots = [...orsetGetDots(state.edgeAlive, edgeKey)];
        this._ops.push(createEdgeRemoveV2(from, to, label, edgeDots));
      }
    }

    // Best-effort delete-guard validation at build time (reject/warn modes)
    if (state && this._onDeleteWithData !== 'cascade') {
      const { edges, props, hasData } = findAttachedData(state, nodeId);
      if (hasData) {
        const details = [];
        if (edges.length > 0) {
          details.push(`${edges.length} edge(s)`);
        }
        if (props.length > 0) {
          details.push(`${props.length} propert${props.length === 1 ? 'y' : 'ies'}`);
        }
        const summary = details.join(' and ');

        if (this._onDeleteWithData === 'reject') {
          throw new Error(
            `Cannot delete node '${nodeId}': node has attached data (${summary}). ` +
            `Remove edges and properties first, or set onDeleteWithData to 'cascade'.`
          );
        }

        if (this._onDeleteWithData === 'warn') {
          // eslint-disable-next-line no-console
          console.warn(
            `[warp] Deleting node '${nodeId}' which has attached data (${summary}). ` +
            `Orphaned data will remain in state.`
          );
        }
      }
    }

    const observedDots = state ? [...orsetGetDots(state.nodeAlive, nodeId)] : [];
    this._ops.push(createNodeRemoveV2(nodeId, observedDots));
    return this;
  }

  /**
   * Adds an edge between two nodes.
   * Generates a new dot using vvIncrement.
   *
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {string} label - Edge label/type
   * @returns {PatchBuilderV2} This builder for chaining
   *
   * @example
   * builder.addEdge('user:alice', 'user:bob', 'follows');
   */
  addEdge(from, to, label) {
    const dot = vvIncrement(this._vv, this._writerId);
    this._ops.push(createEdgeAddV2(from, to, label, dot));
    this._edgesAdded.add(encodeEdgeKey(from, to, label));
    return this;
  }

  /**
   * Removes an edge between two nodes.
   * Reads observed dots from current state to enable proper OR-Set removal.
   *
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {string} label - Edge label/type
   * @returns {PatchBuilderV2} This builder for chaining
   *
   * @example
   * builder.removeEdge('user:alice', 'user:bob', 'follows');
   */
  removeEdge(from, to, label) {
    // Get observed dots from current state (orsetGetDots returns already-encoded dot strings)
    const state = this._getCurrentState();
    const edgeKey = encodeEdgeKey(from, to, label);
    const observedDots = state ? [...orsetGetDots(state.edgeAlive, edgeKey)] : [];
    this._ops.push(createEdgeRemoveV2(from, to, label, observedDots));
    return this;
  }

  /**
   * Sets a property on a node.
   * Props use EventId from patch context (lamport + writer), not dots.
   *
   * @param {string} nodeId - The node ID to set the property on
   * @param {string} key - Property key
   * @param {*} value - Property value (any JSON-serializable type)
   * @returns {PatchBuilderV2} This builder for chaining
   *
   * @example
   * builder.setProperty('user:alice', 'name', 'Alice');
   */
  setProperty(nodeId, key, value) {
    // Props don't use dots - they use EventId from patch context
    this._ops.push(createPropSetV2(nodeId, key, value));
    return this;
  }

  /**
   * Sets a property on an edge.
   * Props use EventId from patch context (lamport + writer), not dots.
   *
   * The edge is identified by (from, to, label). The property is stored
   * under the edge property key namespace using the \x01 prefix, so that
   * JoinReducer's `encodePropKey(op.node, op.key)` produces the canonical
   * `encodeEdgePropKey(from, to, label, key)` encoding.
   *
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {string} label - Edge label/type
   * @param {string} key - Property key
   * @param {*} value - Property value (any JSON-serializable type)
   * @returns {PatchBuilderV2} This builder for chaining
   *
   * @example
   * builder.setEdgeProperty('user:alice', 'user:bob', 'follows', 'since', '2025-01-01');
   */
  setEdgeProperty(from, to, label, key, value) {
    // Validate edge exists in this patch or in current state
    const ek = encodeEdgeKey(from, to, label);
    if (!this._edgesAdded.has(ek)) {
      const state = this._getCurrentState();
      if (!state || !orsetContains(state.edgeAlive, ek)) {
        throw new Error(`Cannot set property on unknown edge (${from} → ${to} [${label}]): add the edge first`);
      }
    }

    // Encode the edge identity as the "node" field with the \x01 prefix.
    // When JoinReducer processes: encodePropKey(op.node, op.key)
    //   = `\x01from\0to\0label` + `\0` + key
    //   = `\x01from\0to\0label\0key`
    //   = encodeEdgePropKey(from, to, label, key)
    const edgeNode = `${EDGE_PROP_PREFIX}${from}\0${to}\0${label}`;
    this._ops.push(createPropSetV2(edgeNode, key, value));
    return this;
  }

  /**
   * Builds the PatchV2 object.
   *
   * @returns {import('../types/WarpTypesV2.js').PatchV2} The constructed patch
   */
  build() {
    const schema = this._ops.some(op => op.type === 'PropSet' && op.node.charCodeAt(0) === 1) ? 3 : 2;
    return createPatchV2({
      schema,
      writer: this._writerId,
      lamport: this._lamport,
      context: this._vv,
      ops: this._ops,
    });
  }

  /**
   * Commits the patch to the graph.
   *
   * Serializes the patch as CBOR, writes it to Git, creates a commit
   * with proper trailers, and updates the writer ref.
   *
   * @returns {Promise<string>} The commit SHA of the new patch
   * @throws {Error} If the patch is empty (no operations)
   * @throws {Error} If a concurrent commit was detected (writer ref advanced)
   *
   * @example
   * const sha = await builder
   *   .addNode('user:alice')
   *   .setProperty('user:alice', 'name', 'Alice')
   *   .addEdge('user:alice', 'user:bob', 'follows')
   *   .commit();
   */
  async commit() {
    // 1. Reject empty patches
    if (this._ops.length === 0) {
      throw new Error('Cannot commit empty patch: no operations added');
    }

    // 2. Race detection: check if writer ref has advanced since builder creation
    const writerRef = buildWriterRef(this._graphName, this._writerId);
    const currentRefSha = await this._persistence.readRef(writerRef);

    if (currentRefSha !== this._expectedParentSha) {
      const err = new WriterError(
        'WRITER_CAS_CONFLICT',
        'Commit failed: writer ref was updated by another process. Re-materialize and retry.'
      );
      err.expectedSha = this._expectedParentSha;
      err.actualSha = currentRefSha;
      throw err;
    }

    // 3. Calculate lamport and parent from current ref state
    let lamport = 1;
    let parentCommit = null;

    if (currentRefSha) {
      // Read the current patch commit to get its lamport timestamp
      const commitMessage = await this._persistence.showNode(currentRefSha);
      const patchInfo = decodePatchMessage(commitMessage);
      lamport = patchInfo.lamport + 1;
      parentCommit = currentRefSha;
    }

    // 3. Build PatchV2 structure with correct lamport
    // Note: Dots were assigned using constructor lamport, but commit lamport may differ.
    // For now, we use the calculated lamport for the patch metadata.
    // The dots themselves are independent of patch lamport (they use VV counters).
    const schema = this._ops.some(op => op.type === 'PropSet' && op.node.charCodeAt(0) === 1) ? 3 : 2;
    const patch = {
      schema,
      writer: this._writerId,
      lamport,
      context: vvSerialize(this._vv),
      ops: this._ops,
    };

    // 4. Encode patch as CBOR
    const patchCbor = encode(patch);

    // 5. Write patch.cbor blob
    const patchBlobOid = await this._persistence.writeBlob(patchCbor);

    // 6. Create tree with the blob
    // Format for mktree: "mode type oid\tpath"
    const treeEntry = `100644 blob ${patchBlobOid}\tpatch.cbor`;
    const treeOid = await this._persistence.writeTree([treeEntry]);

    // 7. Create patch commit message with trailers (schema:2)
    const commitMessage = encodePatchMessage({
      graph: this._graphName,
      writer: this._writerId,
      lamport,
      patchOid: patchBlobOid,
      schema,
    });

    // 8. Create commit with tree, linking to previous patch as parent if exists
    const parents = parentCommit ? [parentCommit] : [];
    const newCommitSha = await this._persistence.commitNodeWithTree({
      treeOid,
      parents,
      message: commitMessage,
    });

    // 9. Update writer ref to point to new commit
    await this._persistence.updateRef(writerRef, newCommitSha);

    // 10. Notify success callback (updates graph's version vector + eager re-materialize)
    if (this._onCommitSuccess) {
      this._onCommitSuccess({ patch, sha: newCommitSha });
    }

    // 11. Return the new commit SHA
    return newCommitSha;
  }

  /**
   * Gets the operations array.
   *
   * @returns {import('../types/WarpTypesV2.js').OpV2[]} The operations
   */
  get ops() {
    return this._ops;
  }

  /**
   * Gets the current version vector (with local increments).
   *
   * @returns {import('../crdt/VersionVector.js').VersionVector} The version vector
   */
  get versionVector() {
    return this._vv;
  }
}
