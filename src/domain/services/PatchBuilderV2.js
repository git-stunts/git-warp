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

import defaultCodec from '../utils/defaultCodec.js';
import nullLogger from '../utils/nullLogger.js';
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
import { encodeEdgeKey, EDGE_PROP_PREFIX } from './KeyCodec.js';
import { encodePatchMessage, decodePatchMessage } from './WarpMessageCodec.js';
import { buildWriterRef } from '../utils/RefLayout.js';
import WriterError from '../errors/WriterError.js';

/**
 * Inspects materialized state for edges and properties attached to a node.
 *
 * Used internally by `removeNode` to detect attached data before deletion.
 * When a node has connected edges or properties, the builder can reject,
 * warn, or cascade delete based on the `onDeleteWithData` policy.
 *
 * @param {import('./JoinReducer.js').WarpStateV5} state - Materialized state to inspect
 * @param {string} nodeId - Node ID to check for attached data
 * @returns {{ edges: string[], props: string[], hasData: boolean }} Object containing:
 *   - `edges`: Array of encoded edge keys (`from\0to\0label`) connected to this node
 *   - `props`: Array of property keys (`nodeId\0key`) belonging to this node
 *   - `hasData`: Boolean indicating whether any edges or properties are attached
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
   *   (uses CommitPort + RefPort + BlobPort + TreePort methods)
   * @param {string} options.graphName - Graph namespace
   * @param {string} options.writerId - This writer's ID
   * @param {number} options.lamport - Lamport timestamp for this patch
   * @param {import('../crdt/VersionVector.js').VersionVector} options.versionVector - Current version vector
   * @param {Function} options.getCurrentState - Function that returns the current materialized state
   * @param {string|null} [options.expectedParentSha] - Expected parent SHA for race detection
   * @param {Function|null} [options.onCommitSuccess] - Callback invoked after successful commit
   * @param {'reject'|'cascade'|'warn'} [options.onDeleteWithData='warn'] - Policy when deleting a node with attached data
   * @param {import('../../ports/CodecPort.js').default} [options.codec] - Codec for serialization
   * @param {{ warn: Function }} [options.logger] - Logger for non-fatal warnings
   */
  constructor({ persistence, graphName, writerId, lamport, versionVector, getCurrentState, expectedParentSha = null, onCommitSuccess = null, onDeleteWithData = 'warn', codec, logger }) {
    /** @type {import('../../ports/GraphPersistencePort.js').default & import('../../ports/RefPort.js').default & import('../../ports/CommitPort.js').default & import('../../ports/BlobPort.js').default & import('../../ports/TreePort.js').default} */
    this._persistence = /** @type {*} */ (persistence); // TODO(ts-cleanup): narrow port type

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

    /** @type {import('../../ports/CodecPort.js').default} */
    this._codec = codec || defaultCodec;

    /** @type {{ warn: Function }} */
    this._logger = logger || nullLogger;

    /**
     * Nodes/edges read by this patch (for provenance tracking).
     *
     * Design note: "reads" track observed-dot dependencies — entities whose
     * state was consulted to build this patch. Remove operations read the
     * entity to observe its dots (OR-Set semantics). "Writes" track new data
     * creation (adds). This distinction enables finer-grained provenance
     * queries like "which patches wrote to X?" vs "which patches depended on X?"
     *
     * @type {Set<string>}
     */
    this._reads = new Set();

    /**
     * Nodes/edges written by this patch (for provenance tracking).
     *
     * Writes represent new data creation: NodeAdd writes the node, EdgeAdd
     * writes the edge key, PropSet writes the node. Remove operations are
     * intentionally tracked only as reads (see _reads comment above).
     *
     * @type {Set<string>}
     */
    this._writes = new Set();
  }

  /**
   * Adds a node to the graph.
   *
   * Generates a new dot (version vector increment) for the add operation,
   * enabling proper OR-Set semantics. The dot uniquely identifies this
   * add event for later observed-remove operations.
   *
   * @param {string} nodeId - The node ID to add. Should be unique within the graph.
   *   Convention: use namespaced IDs like `'user:alice'` or `'doc:123'`.
   * @returns {PatchBuilderV2} This builder instance for method chaining
   *
   * @example
   * builder.addNode('user:alice');
   *
   * @example
   * // Chained with other operations
   * builder
   *   .addNode('user:alice')
   *   .addNode('user:bob')
   *   .addEdge('user:alice', 'user:bob', 'follows');
   */
  addNode(nodeId) {
    const dot = vvIncrement(this._vv, this._writerId);
    this._ops.push(createNodeAddV2(nodeId, dot));
    // Provenance: NodeAdd writes the node
    this._writes.add(nodeId);
    return this;
  }

  /**
   * Removes a node from the graph.
   *
   * Reads observed dots from the current materialized state to enable proper
   * OR-Set removal semantics. The removal only affects add events that have
   * been observed at the time of removal; concurrent adds will survive.
   *
   * Behavior when the node has attached data (edges or properties) is controlled
   * by the `onDeleteWithData` constructor option:
   * - `'reject'`: Throws an error, preventing the deletion
   * - `'cascade'`: Automatically generates `removeEdge` operations for all connected edges
   * - `'warn'` (default): Logs a warning but allows the deletion, leaving orphaned data
   *
   * @param {string} nodeId - The node ID to remove
   * @returns {PatchBuilderV2} This builder instance for method chaining
   * @throws {Error} When `onDeleteWithData` is `'reject'` and the node has attached
   *   edges or properties. Error message includes counts of attached data.
   *
   * @example
   * builder.removeNode('user:alice');
   *
   * @example
   * // With cascade mode enabled in constructor
   * const builder = graph.createPatch({ onDeleteWithData: 'cascade' });
   * builder.removeNode('user:alice'); // Also removes all connected edges
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
        const edgeDots = /** @type {import('../crdt/Dot.js').Dot[]} */ (/** @type {unknown} */ ([...orsetGetDots(state.edgeAlive, edgeKey)]));
        this._ops.push(createEdgeRemoveV2(from, to, label, edgeDots));
        // Provenance: cascade-generated EdgeRemove reads the edge key (to observe its dots)
        this._reads.add(edgeKey);
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

    const observedDots = /** @type {import('../crdt/Dot.js').Dot[]} */ (/** @type {unknown} */ (state ? [...orsetGetDots(state.nodeAlive, nodeId)] : []));
    this._ops.push(createNodeRemoveV2(nodeId, observedDots));
    // Provenance: NodeRemove reads the node (to observe its dots)
    this._reads.add(nodeId);
    return this;
  }

  /**
   * Adds a directed edge between two nodes.
   *
   * Generates a new dot (version vector increment) for the add operation,
   * enabling proper OR-Set semantics. The edge is identified by the triple
   * `(from, to, label)`, allowing multiple edges between the same nodes
   * with different labels.
   *
   * Note: This does not validate that the source and target nodes exist.
   * Edges can reference nodes that will be added later in the same patch
   * or that exist in the materialized state.
   *
   * @param {string} from - Source node ID (edge origin)
   * @param {string} to - Target node ID (edge destination)
   * @param {string} label - Edge label/type describing the relationship
   * @returns {PatchBuilderV2} This builder instance for method chaining
   *
   * @example
   * builder.addEdge('user:alice', 'user:bob', 'follows');
   *
   * @example
   * // Multiple edges between same nodes with different labels
   * builder
   *   .addEdge('user:alice', 'user:bob', 'follows')
   *   .addEdge('user:alice', 'user:bob', 'collaborates_with');
   */
  addEdge(from, to, label) {
    const dot = vvIncrement(this._vv, this._writerId);
    this._ops.push(createEdgeAddV2(from, to, label, dot));
    const edgeKey = encodeEdgeKey(from, to, label);
    this._edgesAdded.add(edgeKey);
    // Provenance: EdgeAdd reads both endpoint nodes, writes the edge key
    this._reads.add(from);
    this._reads.add(to);
    this._writes.add(edgeKey);
    return this;
  }

  /**
   * Removes a directed edge between two nodes.
   *
   * Reads observed dots from the current materialized state to enable proper
   * OR-Set removal semantics. The removal only affects add events that have
   * been observed at the time of removal; concurrent adds will survive.
   *
   * The edge is identified by the exact triple `(from, to, label)`. Removing
   * an edge that doesn't exist is a no-op (the removal will have no observed
   * dots and will not affect the materialized state).
   *
   * @param {string} from - Source node ID (edge origin)
   * @param {string} to - Target node ID (edge destination)
   * @param {string} label - Edge label/type describing the relationship
   * @returns {PatchBuilderV2} This builder instance for method chaining
   *
   * @example
   * builder.removeEdge('user:alice', 'user:bob', 'follows');
   *
   * @example
   * // Remove edge before removing connected nodes
   * builder
   *   .removeEdge('user:alice', 'user:bob', 'follows')
   *   .removeNode('user:alice');
   */
  removeEdge(from, to, label) {
    // Get observed dots from current state (orsetGetDots returns already-encoded dot strings)
    const state = this._getCurrentState();
    const edgeKey = encodeEdgeKey(from, to, label);
    const observedDots = /** @type {import('../crdt/Dot.js').Dot[]} */ (/** @type {unknown} */ (state ? [...orsetGetDots(state.edgeAlive, edgeKey)] : []));
    this._ops.push(createEdgeRemoveV2(from, to, label, observedDots));
    // Provenance: EdgeRemove reads the edge key (to observe its dots)
    this._reads.add(edgeKey);
    return this;
  }

  /**
   * Sets a property on a node.
   *
   * Properties use Last-Write-Wins (LWW) semantics ordered by EventId
   * (lamport timestamp, then writer ID, then patch SHA). Unlike node/edge
   * operations which use OR-Set dots, properties are simple registers
   * where the latest write wins deterministically.
   *
   * Note: This does not validate that the node exists. Properties can be
   * set on nodes that will be added later in the same patch or that exist
   * in the materialized state.
   *
   * @param {string} nodeId - The node ID to set the property on
   * @param {string} key - Property key (should not contain null bytes)
   * @param {*} value - Property value. Must be JSON-serializable (strings,
   *   numbers, booleans, arrays, plain objects, or null). Use `null` to
   *   effectively delete a property (LWW semantics).
   * @returns {PatchBuilderV2} This builder instance for method chaining
   *
   * @example
   * builder.setProperty('user:alice', 'name', 'Alice');
   *
   * @example
   * // Set multiple properties on the same node
   * builder
   *   .setProperty('user:alice', 'name', 'Alice')
   *   .setProperty('user:alice', 'email', 'alice@example.com')
   *   .setProperty('user:alice', 'age', 30);
   */
  setProperty(nodeId, key, value) {
    // Props don't use dots - they use EventId from patch context
    this._ops.push(createPropSetV2(nodeId, key, value));
    // Provenance: PropSet reads the node (implicit existence check) and writes the node
    this._reads.add(nodeId);
    this._writes.add(nodeId);
    return this;
  }

  /**
   * Sets a property on an edge.
   *
   * Properties use Last-Write-Wins (LWW) semantics ordered by EventId
   * (lamport timestamp, then writer ID, then patch SHA). The edge is
   * identified by the triple `(from, to, label)`.
   *
   * Internally, edge properties are stored using a special encoding with
   * the `\x01` prefix to distinguish them from node properties. The
   * JoinReducer processes them using the canonical edge property key format.
   *
   * Unlike `setProperty`, this method validates that the edge exists either
   * in the current patch (added via `addEdge`) or in the materialized state.
   * This prevents setting properties on edges that don't exist.
   *
   * @param {string} from - Source node ID (edge origin)
   * @param {string} to - Target node ID (edge destination)
   * @param {string} label - Edge label/type identifying which edge to modify
   * @param {string} key - Property key (should not contain null bytes)
   * @param {*} value - Property value. Must be JSON-serializable (strings,
   *   numbers, booleans, arrays, plain objects, or null). Use `null` to
   *   effectively delete a property (LWW semantics).
   * @returns {PatchBuilderV2} This builder instance for method chaining
   * @throws {Error} When the edge `(from, to, label)` does not exist in
   *   either this patch or the current materialized state. Message format:
   *   `"Cannot set property on unknown edge (from -> to [label]): add the edge first"`
   *
   * @example
   * builder.setEdgeProperty('user:alice', 'user:bob', 'follows', 'since', '2025-01-01');
   *
   * @example
   * // Add edge and set property in the same patch
   * builder
   *   .addEdge('user:alice', 'user:bob', 'follows')
   *   .setEdgeProperty('user:alice', 'user:bob', 'follows', 'since', '2025-01-01')
   *   .setEdgeProperty('user:alice', 'user:bob', 'follows', 'public', true);
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
    // Provenance: setEdgeProperty reads the edge (implicit existence check) and writes the edge
    this._reads.add(ek);
    this._writes.add(ek);
    return this;
  }

  /**
   * Builds the PatchV2 object without committing.
   *
   * This method constructs the patch structure from all queued operations.
   * The patch includes the schema version (2 or 3 depending on whether edge
   * properties are present), writer ID, lamport timestamp, version vector
   * context, and all operations.
   *
   * Note: This method is primarily for testing and inspection. For normal
   * usage, prefer `commit()` which builds and persists the patch atomically.
   *
   * @returns {import('../types/WarpTypesV2.js').PatchV2} The constructed patch object containing:
   *   - `schema`: Version number (2 for node/edge ops, 3 if edge properties present)
   *   - `writer`: Writer ID string
   *   - `lamport`: Lamport timestamp for ordering
   *   - `context`: Version vector for causal context
   *   - `ops`: Array of operations (NodeAdd, NodeRemove, EdgeAdd, EdgeRemove, PropSet)
   */
  build() {
    const schema = this._ops.some(op => op.type === 'PropSet' && op.node.charCodeAt(0) === 1) ? 3 : 2;
    return createPatchV2({
      schema,
      writer: this._writerId,
      lamport: this._lamport,
      context: /** @type {*} */ (this._vv), // TODO(ts-cleanup): narrow port type
      ops: this._ops,
      reads: [...this._reads].sort(),
      writes: [...this._writes].sort(),
    });
  }

  /**
   * Commits the patch to the graph.
   *
   * This method performs the following steps atomically:
   * 1. Validates the patch is non-empty
   * 2. Checks for concurrent modifications (compare-and-swap on writer ref)
   * 3. Calculates the next lamport timestamp from the parent commit
   * 4. Encodes the patch as CBOR and writes it as a Git blob
   * 5. Creates a Git tree containing the patch blob
   * 6. Creates a commit with proper trailers linking to the parent
   * 7. Updates the writer ref to point to the new commit
   * 8. Invokes the success callback if provided (for eager re-materialization)
   *
   * The commit is written to the writer's patch chain at:
   * `refs/warp/<graphName>/writers/<writerId>`
   *
   * @returns {Promise<string>} The commit SHA of the new patch commit
   * @throws {Error} If the patch is empty (no operations were added).
   *   Message: `"Cannot commit empty patch: no operations added"`
   * @throws {WriterError} If a concurrent commit was detected (another process
   *   advanced the writer ref since this builder was created). Error has
   *   `code: 'WRITER_CAS_CONFLICT'` and properties `expectedSha`, `actualSha`.
   *   Recovery: call `graph.materialize()` and retry with a new builder.
   *
   * @example
   * const sha = await builder
   *   .addNode('user:alice')
   *   .setProperty('user:alice', 'name', 'Alice')
   *   .addEdge('user:alice', 'user:bob', 'follows')
   *   .commit();
   * console.log(`Committed patch: ${sha}`);
   *
   * @example
   * // Handling concurrent modification
   * try {
   *   await builder.commit();
   * } catch (err) {
   *   if (err.code === 'WRITER_CAS_CONFLICT') {
   *     await graph.materialize(); // Refresh state
   *     // Retry with new builder...
   *   }
   * }
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
      const err = /** @type {WriterError & { expectedSha: string|null, actualSha: string|null }} */ (new WriterError(
        'WRITER_CAS_CONFLICT',
        'Commit failed: writer ref was updated by another process. Re-materialize and retry.'
      ));
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
    // Use createPatchV2 for consistent patch construction (DRY with build())
    const patch = createPatchV2({
      schema,
      writer: this._writerId,
      lamport,
      context: vvSerialize(this._vv),
      ops: this._ops,
      reads: [...this._reads].sort(),
      writes: [...this._writes].sort(),
    });

    // 4. Encode patch as CBOR
    const patchCbor = this._codec.encode(patch);

    // 5. Write patch.cbor blob
    const patchBlobOid = await this._persistence.writeBlob(/** @type {Buffer} */ (patchCbor));

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
      try {
        await this._onCommitSuccess({ patch, sha: newCommitSha });
      } catch (err) {
        // Commit is already persisted — log but don't fail the caller.
        this._logger.warn(`[warp] onCommitSuccess callback failed (sha=${newCommitSha}):`, err);
      }
    }

    // 11. Return the new commit SHA
    return newCommitSha;
  }

  /**
   * Gets the operations array.
   *
   * Returns the internal array of operations queued in this builder.
   * Useful for inspection and testing. Modifying the returned array
   * will affect the builder's state.
   *
   * @returns {import('../types/WarpTypesV2.js').OpV2[]} Array of operations, each being one of:
   *   - `NodeAdd`: `{ type: 'NodeAdd', id, dot }`
   *   - `NodeRemove`: `{ type: 'NodeRemove', id, observed }`
   *   - `EdgeAdd`: `{ type: 'EdgeAdd', from, to, label, dot }`
   *   - `EdgeRemove`: `{ type: 'EdgeRemove', from, to, label, observed }`
   *   - `PropSet`: `{ type: 'PropSet', node, key, value }`
   */
  get ops() {
    return this._ops;
  }

  /**
   * Gets the current version vector (with local increments).
   *
   * Returns the builder's version vector, which is cloned from the graph's
   * version vector at construction time and then incremented for each
   * `addNode` and `addEdge` operation. This tracks the causal context
   * for OR-Set dot generation.
   *
   * @returns {import('../crdt/VersionVector.js').VersionVector} The version vector as a
   *   `Map<string, number>` mapping writer IDs to their logical clock values
   */
  get versionVector() {
    return this._vv;
  }

  /**
   * Gets the set of node/edge IDs read by this patch.
   *
   * Returns a frozen copy of the reads tracked for provenance. This includes:
   * - Nodes read via `removeNode` (to observe dots)
   * - Endpoint nodes read via `addEdge` (implicit existence reference)
   * - Edge keys read via `removeEdge` (to observe dots)
   * - Nodes read via `setProperty` (implicit existence reference)
   * - Edge keys read via `setEdgeProperty` (implicit existence reference)
   *
   * Note: Returns a defensive copy to prevent external mutation of internal state.
   * The returned Set is a copy, so mutations to it do not affect the builder.
   *
   * @returns {ReadonlySet<string>} Copy of node IDs and encoded edge keys that were read
   */
  get reads() {
    return new Set(this._reads);
  }

  /**
   * Gets the set of node/edge IDs written by this patch.
   *
   * Returns a copy of the writes tracked for provenance. This includes:
   * - Nodes written via `addNode`
   * - Edge keys written via `addEdge`
   * - Nodes written via `setProperty`
   * - Edge keys written via `setEdgeProperty`
   *
   * Note: Returns a defensive copy to prevent external mutation of internal state.
   * The returned Set is a copy, so mutations to it do not affect the builder.
   *
   * @returns {ReadonlySet<string>} Copy of node IDs and encoded edge keys that were written
   */
  get writes() {
    return new Set(this._writes);
  }
}
