/**
 * PatchBuilderV2 - Fluent API for building WARP v5 (schema:2) patches.
 *
 * Key differences from PatchBuilder:
 * 1. Maintains a VersionVector per writer
 * 2. Assigns dots on add operations using vv.increment()
 * 3. Reads current state to populate observedDots for removes
 * 4. Includes context VersionVector in patch
 *
 * @module domain/services/PatchBuilderV2
 * @see WARP v5 Spec
 */

import nullLogger from '../utils/nullLogger.js';
import { vvSerialize } from '../crdt/VersionVector.js';
import { orsetGetDots, orsetContains, orsetElements } from '../crdt/ORSet.js';
import {
  createNodeAddV2,
  createNodeRemoveV2,
  createEdgeAddV2,
  createEdgeRemoveV2,
  createNodePropSetV2,
  createEdgePropSetV2,
  createPatchV2,
} from '../types/WarpTypesV2.js';
import {
  encodeEdgeKey,
  FIELD_SEPARATOR,
  EDGE_PROP_PREFIX,
  CONTENT_PROPERTY_KEY,
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_SIZE_PROPERTY_KEY,
  EFFECT_NODE_PREFIX,
} from './KeyCodec.js';
import { lowerCanonicalOp } from './OpNormalizer.js';
import { encodePatchMessage, decodePatchMessage, detectMessageKind } from './codec/WarpMessageCodec.js';
import { buildWriterRef } from '../utils/RefLayout.js';
import WriterError from '../errors/WriterError.js';
import { isStreamingInput, normalizeToAsyncIterable } from '../utils/streamUtils.js';
import { canonicalStringify } from '../utils/canonicalStringify.js';
import PatchError from '../errors/PatchError.js';

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

  // Edge keys are encoded as "from\0to\0label". Check prefix for source
  // and interior substring for target — avoids split() on every key.
  const srcPrefix = `${nodeId}\0`;
  const tgtInfix = `\0${nodeId}\0`;
  for (const key of orsetElements(state.edgeAlive)) {
    if (key.startsWith(srcPrefix) || key.includes(tgtInfix)) {
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
 * Validates that an identifier does not contain reserved bytes that would
 * make the legacy edge-property encoding ambiguous.
 *
 * Rejects:
 * - Identifiers containing \0 (field separator)
 * - Identifiers starting with \x01 (edge property prefix)
 *
 * @param {string} value - Identifier to validate
 * @param {string} label - Human-readable label for error messages
 * @throws {Error} If the identifier contains reserved bytes
 */
function _assertNoReservedBytes(value, label) {
  if (typeof value !== 'string') {
    throw new Error(`${label} must be a string, got ${typeof value}`);
  }
  if (value.includes(FIELD_SEPARATOR)) {
    throw new Error(`${label} must not contain null bytes (\\0): ${JSON.stringify(value)}`);
  }
  if (value.length > 0 && value[0] === EDGE_PROP_PREFIX) {
    throw new Error(`${label} must not start with reserved prefix \\x01: ${JSON.stringify(value)}`);
  }
}

/**
 * Calculates the persisted byte length of attached content.
 *
 * String content is encoded as UTF-8 before hashing/storage, so metadata
 * should reflect the encoded byte length rather than JavaScript code units.
 *
 * @param {Uint8Array|string} content
 * @returns {number}
 */
function byteSizeOfContent(content) {
  return typeof content === 'string'
    ? new TextEncoder().encode(content).byteLength
    : content.byteLength;
}

/**
 * Validates and normalizes optional content metadata for attachment APIs.
 *
 * Size is always persisted, either computed from the content bytes or
 * validated against the provided hint when callers pass `{ size }`.
 *
 * @param {Uint8Array|string} content
 * @param {{ mime?: string|null, size?: number|null }|undefined} metadata
 * @returns {{ mime: string|null, size: number }}
 */
function normalizeContentMetadata(content, metadata) {
  if (metadata !== undefined && (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata))) {
    throw new Error('content metadata must be an object when provided');
  }

  const actualSize = byteSizeOfContent(content);
  const providedSize = metadata?.size;
  if (providedSize !== undefined && providedSize !== null) {
    if (!Number.isInteger(providedSize) || providedSize < 0) {
      throw new Error('content metadata size must be a non-negative integer');
    }
    if (providedSize !== actualSize) {
      throw new Error(`content metadata size ${providedSize} does not match actual byte size ${actualSize}`);
    }
  }

  const providedMime = metadata?.mime;
  if (providedMime !== undefined && providedMime !== null) {
    if (typeof providedMime !== 'string' || providedMime.trim() === '') {
      throw new Error('content metadata mime must be a non-empty string when provided');
    }
  }

  return {
    mime: typeof providedMime === 'string' ? providedMime : null,
    size: actualSize,
  };
}

/**
 * Fluent builder for creating WARP v5 patches with dots and observed-remove semantics.
 */
export class PatchBuilderV2 {
  /**
   * Creates a new PatchBuilderV2.
   *
   * @param {{ persistence: import('../../ports/CommitPort.js').default & import('../../ports/BlobPort.js').default & import('../../ports/TreePort.js').default & import('../../ports/RefPort.js').default, graphName: string, writerId: string, lamport: number, versionVector: import('../crdt/VersionVector.js').default, getCurrentState: () => import('./JoinReducer.js').WarpStateV5 | null, expectedParentSha?: string|null, targetRefPath?: string, onCommitSuccess?: ((result: {patch: import('../types/WarpTypesV2.js').PatchV2, sha: string}) => void | Promise<void>)|null, onDeleteWithData?: 'reject'|'cascade'|'warn', patchJournal?: import('../../ports/PatchJournalPort.js').default, logger?: import('../../ports/LoggerPort.js').default, blobStorage?: import('../../ports/BlobStoragePort.js').default }} options
   */
  constructor({ persistence, graphName, writerId, lamport, versionVector, getCurrentState, expectedParentSha = null, targetRefPath, onCommitSuccess = null, onDeleteWithData = 'warn', patchJournal, logger, blobStorage }) {
    /** @type {import('../../ports/CommitPort.js').default & import('../../ports/BlobPort.js').default & import('../../ports/TreePort.js').default & import('../../ports/RefPort.js').default} */
    this._persistence = /** @type {import('../../ports/CommitPort.js').default & import('../../ports/BlobPort.js').default & import('../../ports/TreePort.js').default & import('../../ports/RefPort.js').default} */ (persistence);

    /** @type {string} */
    this._graphName = graphName;

    /** @type {string} */
    this._writerId = writerId;

    /** @type {string|null} */
    this._targetRefPath = typeof targetRefPath === 'string' && targetRefPath.length > 0
      ? targetRefPath
      : null;

    /** @type {number} */
    this._lamport = lamport;

    /** @type {import('../crdt/VersionVector.js').default} */
    this._vv = versionVector.clone(); // Clone to track local increments

    /** @type {() => import('./JoinReducer.js').WarpStateV5 | null} */
    this._getCurrentState = getCurrentState;

    /**
     * Snapshot of state captured at construction time (C4).
     * Lazily populated on first call to _getSnapshotState().
     * Prevents TOCTOU races where concurrent writes change state
     * between remove operations in the same patch.
     * @type {import('./JoinReducer.js').WarpStateV5|null}
     */
    this._snapshotState = /** @type {import('./JoinReducer.js').WarpStateV5|null} */ (/** @type {unknown} */ (undefined)); // undefined = not yet captured

    /** @type {string|null} */
    this._expectedParentSha = expectedParentSha;

    /** @type {((result: {patch: import('../types/WarpTypesV2.js').PatchV2, sha: string}) => void | Promise<void>)|null} */
    this._onCommitSuccess = onCommitSuccess;

    /** @type {import('../types/WarpTypesV2.js').OpV2[]} */
    this._ops = [];

    /** @type {Set<string>} Node IDs added in this patch (for attachContent validation) */
    this._nodesAdded = new Set();

    /** @type {Set<string>} Edge keys added in this patch (for setEdgeProperty validation) */
    this._edgesAdded = new Set();

    /** @type {'reject'|'cascade'|'warn'} */
    this._onDeleteWithData = onDeleteWithData;

    /** @type {import('../../ports/PatchJournalPort.js').default|null} */
    this._patchJournal = patchJournal || null;

    /** @type {import('../../ports/LoggerPort.js').default} */
    this._logger = logger || nullLogger;

    /**
     * Content blob OIDs written during this patch via attachContent/attachEdgeContent.
     * These are embedded in the commit tree for GC protection.
     * @type {string[]}
     */
    this._contentBlobs = [];

    /** @type {import('../../ports/BlobStoragePort.js').default|null} */
    this._blobStorage = blobStorage || null;

    /**
     * Observed operands — entities whose current state was consulted to build
     * this patch.
     *
     * Semantic model per operation type:
     * - removeNode(id): observes node `id` (reads its OR-Set dots for tombstoning)
     * - removeEdge(from, to, label): observes the edge key
     * - addEdge(from, to, label): observes both endpoint nodes `from` and `to`
     * - setProperty(nodeId, key, value): observes node `nodeId`
     * - setEdgeProperty(from, to, label, key, value): observes the edge key
     * - cascade-generated EdgeRemove: observes the edge key
     *
     * The public getter `.reads` and the serialized patch field `reads` retain
     * the historical name for backward compatibility.
     *
     * @type {Set<string>}
     */
    this._observedOperands = new Set();

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

    /** @type {boolean} Whether any edge-property ops have been added (schema 3 flag cache). */
    this._hasEdgeProps = false;

    /** @type {boolean} */
    this._committed = false;

    /** @type {boolean} */
    this._committing = false;
  }

  /**
   * Returns a snapshot of the current state, captured lazily on first call (C4).
   *
   * All remove operations within this patch observe dots from the same
   * state snapshot, preventing TOCTOU races where concurrent writers
   * change state between operations.
   *
   * @returns {import('./JoinReducer.js').WarpStateV5|null}
   * @private
   */
  _getSnapshotState() {
    if (this._snapshotState === undefined) {
      this._snapshotState = this._getCurrentState() || null;
    }
    return this._snapshotState;
  }

  /**
   * Throws if this builder is no longer open for mutation.
   * @private
   */
  _assertNotCommitted() {
    if (this._committed || this._committing) {
      throw new Error('PatchBuilder already committed — create a new builder');
    }
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
    this._assertNotCommitted();
    _assertNoReservedBytes(nodeId, 'nodeId');
    const dot = this._vv.increment(this._writerId);
    this._ops.push(createNodeAddV2(nodeId, dot));
    this._nodesAdded.add(nodeId);
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
    this._assertNotCommitted();
    // Get observed dots from current state (orsetGetDots returns already-encoded dot strings)
    const state = this._getSnapshotState();

    // Cascade mode: auto-generate EdgeRemove ops for all connected edges before NodeRemove.
    // Generated ops appear in the patch for auditability.
    if (this._onDeleteWithData === 'cascade' && state) {
      const { edges } = findAttachedData(state, nodeId);
      for (const edgeKey of edges) {
        const parts = edgeKey.split('\0');
        const from = /** @type {string} */ (parts[0]);
        const to = /** @type {string} */ (parts[1]);
        const label = /** @type {string} */ (parts[2]);
        const edgeDots = [...orsetGetDots(state.edgeAlive, edgeKey)];
        this._ops.push(createEdgeRemoveV2(from, to, label, edgeDots));
        // Provenance: cascade-generated EdgeRemove reads the edge key (to observe its dots)
        this._observedOperands.add(edgeKey);
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
          this._logger.warn(
            `[warp] Deleting node '${nodeId}' which has attached data (${summary}). ` +
            `Orphaned data will remain in state.`
          );
        }
      }
    }

    const observedDots = state ? [...orsetGetDots(state.nodeAlive, nodeId)] : [];
    this._ops.push(createNodeRemoveV2(nodeId, observedDots));
    // Provenance: NodeRemove reads the node (to observe its dots)
    this._observedOperands.add(nodeId);
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
    this._assertNotCommitted();
    _assertNoReservedBytes(from, 'from node ID');
    _assertNoReservedBytes(to, 'to node ID');
    _assertNoReservedBytes(label, 'edge label');
    const dot = this._vv.increment(this._writerId);
    this._ops.push(createEdgeAddV2(from, to, label, dot));
    const edgeKey = encodeEdgeKey(from, to, label);
    this._edgesAdded.add(edgeKey);
    // Provenance: EdgeAdd reads both endpoint nodes, writes the edge key
    this._observedOperands.add(from);
    this._observedOperands.add(to);
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
    this._assertNotCommitted();
    // Get observed dots from current state (orsetGetDots returns already-encoded dot strings)
    const state = this._getSnapshotState();
    const edgeKey = encodeEdgeKey(from, to, label);
    const observedDots = state ? [...orsetGetDots(state.edgeAlive, edgeKey)] : [];
    this._ops.push(createEdgeRemoveV2(from, to, label, observedDots));
    // Provenance: EdgeRemove reads the edge key (to observe its dots)
    this._observedOperands.add(edgeKey);
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
   * @param {unknown} value - Property value. Must be JSON-serializable (strings,
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
  /**
   * Emits an effect entity in this patch.
   *
   * Sugar for addNode('effect:...') + setProperty calls. The effect
   * shares the same patch commit as the rewrite that caused it —
   * same Lamport timestamp, same provenance, same causal position.
   *
   * No wall-clock time. Causal ordering comes from the patch's
   * Lamport timestamp. Wall-clock time is non-deterministic and
   * has no place in substrate truth.
   *
   * @param {string} kind - Effect kind (generic string, app-defined)
   * @param {unknown} [payload] - Opaque payload (JSON-serialized if non-null)
   * @param {{ effectId?: string }} [options]
   * @returns {string} The effect node ID
   *
   * @example
   * await core.patch(p => {
   *   p.addNode('user:alice');
   *   p.emitEffect('user-created', { userId: 'user:alice' });
   * });
   */
  emitEffect(kind, payload, options) {
    this._assertNotCommitted();
    if (typeof kind !== 'string' || kind.length === 0) {
      throw new PatchError('emitEffect: kind must be a non-empty string', {
        code: 'E_EFFECT_INVALID_KIND',
        context: { kind },
      });
    }

    const effectId = (options !== null && options !== undefined && options.effectId !== undefined && options.effectId !== '')
      ? options.effectId
      : `${EFFECT_NODE_PREFIX}${this._writerId}-${this._lamport}-${this._ops.length}`;

    this.addNode(effectId);
    this.setProperty(effectId, 'kind', kind);
    this.setProperty(effectId, 'writer', this._writerId);
    if (payload !== null && payload !== undefined) {
      this.setProperty(effectId, 'payload', canonicalStringify(payload));
    }
    return effectId;
  }

  /**
   * Sets a property on a node using LWW semantics.
   * @param {string} nodeId - Target node ID
   * @param {string} key - Property key
   * @param {unknown} value - Property value
   * @returns {PatchBuilderV2} This builder for chaining
   */
  setProperty(nodeId, key, value) {
    this._assertNotCommitted();
    _assertNoReservedBytes(nodeId, 'nodeId');
    _assertNoReservedBytes(key, 'property key');
    // Canonical NodePropSet — lowered to raw PropSet at commit time
    this._ops.push(createNodePropSetV2(nodeId, key, value));
    // Provenance: NodePropSet reads the node (implicit existence check) and writes the node
    this._observedOperands.add(nodeId);
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
   * @param {unknown} value - Property value. Must be JSON-serializable (strings,
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
    this._assertNotCommitted();
    _assertNoReservedBytes(from, 'from node ID');
    _assertNoReservedBytes(to, 'to node ID');
    _assertNoReservedBytes(label, 'edge label');
    _assertNoReservedBytes(key, 'property key');
    const ek = this._assertEdgeExists(from, to, label);

    // Canonical EdgePropSet — lowered to legacy raw PropSet at commit time
    this._ops.push(createEdgePropSetV2(from, to, label, key, value));
    this._hasEdgeProps = true;
    // Provenance: EdgePropSet reads the edge (implicit existence check) and writes the edge
    this._observedOperands.add(ek);
    this._writes.add(ek);
    return this;
  }

  /**
   * Attaches content to a node by writing the blob to the Git object store
   * and storing the blob OID as the `_content` property.
   *
   * The blob OID is also tracked for embedding in the commit tree, which
   * ensures content blobs survive `git gc` (GC protection via reachability).
   *
   * Note: The node must exist in the materialized state (or be added in
   * this patch) for `getContent()` to find it later. `attachContent()`
   * only sets the `_content` property — it does not create the node.
   *
   * Accepts streaming input (AsyncIterable, ReadableStream) as well as
   * buffered input (Uint8Array, string). Streaming inputs are piped
   * directly to blob storage without intermediate buffering.
   *
   * @param {string} nodeId - The node ID to attach content to
   * @param {AsyncIterable<Uint8Array>|ReadableStream<Uint8Array>|Uint8Array|string} content - The content to attach
   * @param {{ mime?: string|null, size?: number|null }} [metadata] - Optional metadata hint
   * @returns {Promise<PatchBuilderV2>} This builder instance for method chaining
   */
  async attachContent(nodeId, content, metadata = undefined) {
    this._assertNotCommitted();
    _assertNoReservedBytes(nodeId, 'nodeId');
    _assertNoReservedBytes(CONTENT_PROPERTY_KEY, 'key');
    this._assertNodeExistsForContent(nodeId);
    if (!this._blobStorage) {
      throw new WriterError(
        'NO_BLOB_STORAGE',
        'Cannot attach content without blob storage — inject blobStorage via open() or use InMemoryBlobStorageAdapter',
      );
    }
    const slug = `${this._graphName}/${nodeId}`;
    let oid;
    let mime;
    let size;
    if (isStreamingInput(content)) {
      mime = metadata?.mime ?? null;
      size = metadata?.size ?? null;
      const source = normalizeToAsyncIterable(content);
      oid = await this._blobStorage.storeStream(source, { slug, mime, size });
    } else {
      const buffered = /** @type {Uint8Array|string} */ (content);
      const normalizedMeta = normalizeContentMetadata(buffered, metadata);
      mime = normalizedMeta.mime;
      size = normalizedMeta.size;
      oid = await this._blobStorage.store(buffered, { slug, mime, size });
    }
    this.setProperty(nodeId, CONTENT_PROPERTY_KEY, oid);
    this.setProperty(nodeId, CONTENT_SIZE_PROPERTY_KEY, size);
    this.setProperty(nodeId, CONTENT_MIME_PROPERTY_KEY, mime);
    this._contentBlobs.push(oid);
    return this;
  }

  /**
   * Clears content from a node by setting the reserved content registers to
   * `null`.
   *
   * This is the public substrate primitive for removing attached content
   * without requiring higher layers to write reserved `_content*` keys
   * manually.
   *
   * @param {string} nodeId - The node ID to clear content from
   * @returns {PatchBuilderV2} This builder instance for method chaining
   */
  clearContent(nodeId) {
    this._assertNotCommitted();
    _assertNoReservedBytes(nodeId, 'nodeId');
    _assertNoReservedBytes(CONTENT_PROPERTY_KEY, 'key');
    this._assertNodeExistsForContent(nodeId);
    this.setProperty(nodeId, CONTENT_PROPERTY_KEY, null);
    this.setProperty(nodeId, CONTENT_SIZE_PROPERTY_KEY, null);
    this.setProperty(nodeId, CONTENT_MIME_PROPERTY_KEY, null);
    return this;
  }

  /**
   * Attaches content to an edge by writing the blob via blob storage
   * and storing the blob OID as the `_content` edge property.
   *
   * Accepts streaming input (AsyncIterable, ReadableStream) as well as
   * buffered input (Uint8Array, string).
   *
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {string} label - Edge label
   * @param {AsyncIterable<Uint8Array>|ReadableStream<Uint8Array>|Uint8Array|string} content - The content to attach
   * @param {{ mime?: string|null, size?: number|null }} [metadata] - Optional metadata hint
   * @returns {Promise<PatchBuilderV2>} This builder instance for method chaining
   */
  async attachEdgeContent(from, to, label, content, metadata = undefined) {
    this._assertNotCommitted();
    _assertNoReservedBytes(from, 'from');
    _assertNoReservedBytes(to, 'to');
    _assertNoReservedBytes(label, 'label');
    _assertNoReservedBytes(CONTENT_PROPERTY_KEY, 'key');
    this._assertEdgeExists(from, to, label);
    if (!this._blobStorage) {
      throw new WriterError(
        'NO_BLOB_STORAGE',
        'Cannot attach content without blob storage — inject blobStorage via open() or use InMemoryBlobStorageAdapter',
      );
    }
    const slug = `${this._graphName}/${from}/${to}/${label}`;
    let oid;
    let mime;
    let size;
    if (isStreamingInput(content)) {
      mime = metadata?.mime ?? null;
      size = metadata?.size ?? null;
      const source = normalizeToAsyncIterable(content);
      oid = await this._blobStorage.storeStream(source, { slug, mime, size });
    } else {
      const buffered = /** @type {Uint8Array|string} */ (content);
      const normalizedMeta = normalizeContentMetadata(buffered, metadata);
      mime = normalizedMeta.mime;
      size = normalizedMeta.size;
      oid = await this._blobStorage.store(buffered, { slug, mime, size });
    }
    this.setEdgeProperty(from, to, label, CONTENT_PROPERTY_KEY, oid);
    this.setEdgeProperty(from, to, label, CONTENT_SIZE_PROPERTY_KEY, size);
    this.setEdgeProperty(from, to, label, CONTENT_MIME_PROPERTY_KEY, mime);
    this._contentBlobs.push(oid);
    return this;
  }

  /**
   * Clears content from an edge by setting the reserved content registers to
   * `null`.
   *
   * This is the public substrate primitive for removing attached edge content
   * without requiring higher layers to write reserved `_content*` keys
   * manually.
   *
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {string} label - Edge label
   * @returns {PatchBuilderV2} This builder instance for method chaining
   */
  clearEdgeContent(from, to, label) {
    this._assertNotCommitted();
    _assertNoReservedBytes(from, 'from');
    _assertNoReservedBytes(to, 'to');
    _assertNoReservedBytes(label, 'label');
    _assertNoReservedBytes(CONTENT_PROPERTY_KEY, 'key');
    this._assertEdgeExists(from, to, label);
    this.setEdgeProperty(from, to, label, CONTENT_PROPERTY_KEY, null);
    this.setEdgeProperty(from, to, label, CONTENT_SIZE_PROPERTY_KEY, null);
    this.setEdgeProperty(from, to, label, CONTENT_MIME_PROPERTY_KEY, null);
    return this;
  }

  /**
   * Validates that a node exists (added in this patch or in current state) before content attachment.
   * @param {string} nodeId
   * @returns {void}
   * @private
   */
  _assertNodeExistsForContent(nodeId) {
    if (this._nodesAdded.has(nodeId)) {
      return;
    }
    const state = this._getSnapshotState();
    if (!state || !orsetContains(state.nodeAlive, nodeId)) {
      throw new Error(`Cannot attach content to unknown node '${nodeId}': add the node first`);
    }
  }

  /**
   * Validates that an edge exists (added in this patch or in current state) before property operations.
   * @param {string} from
   * @param {string} to
   * @param {string} label
   * @returns {string}
   * @private
   */
  _assertEdgeExists(from, to, label) {
    const ek = encodeEdgeKey(from, to, label);
    if (!this._edgesAdded.has(ek)) {
      const state = this._getSnapshotState();
      if (!state || !orsetContains(state.edgeAlive, ek)) {
        throw new Error(`Cannot set property on unknown edge (${from} → ${to} [${label}]): add the edge first`);
      }
    }
    return ek;
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
    const schema = this._hasEdgeProps ? 3 : 2;
    // Lower canonical ops to raw form for the persisted patch
    const rawOps = /** @type {import('../types/WarpTypesV2.js').RawOpV2[]} */ (this._ops.map(lowerCanonicalOp));
    return createPatchV2({
      schema,
      writer: this._writerId,
      lamport: this._lamport,
      context: vvSerialize(this._vv),
      ops: rawOps,
      reads: [...this._observedOperands].sort(),
      writes: [...this._writes].sort(),
    });
  }

  /**
   * Commits the patch to the graph.
   *
   * This method performs the following steps atomically:
   * 1. Verifies this builder is still open (not committed and not in-flight)
   * 2. Validates the patch is non-empty
   * 3. Checks for concurrent modifications (compare-and-swap on writer ref)
   * 4. Calculates the next lamport timestamp from the parent commit
   * 5. Builds the PatchV2 structure with the resolved lamport
   * 6. Encodes the patch as CBOR and writes it as a Git blob
   * 7. Creates a Git tree containing the patch blob
   * 8. Creates a commit with proper trailers linking to the parent
   * 9. Updates the writer ref to point to the new commit
   * 10. Invokes the success callback if provided (for eager re-materialization)
   *
   * The commit is written to the writer's patch chain at:
   * `refs/warp/<graphName>/writers/<writerId>`
   *
   * @returns {Promise<string>} The commit SHA of the new patch commit
   * @throws {Error} If this builder has already been committed, or a commit
   *   is currently in-flight on this builder.
   *   Message: `"PatchBuilder already committed — create a new builder"`
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
    this._assertNotCommitted();
    this._committing = true;
    try {
      // 2. Reject empty patches
      if (this._ops.length === 0) {
        throw new Error('Cannot commit empty patch: no operations added');
      }

      // 3. Race detection: check if writer ref has advanced since builder creation
      const writerRef = (this._targetRefPath !== null && this._targetRefPath !== '')
        ? this._targetRefPath
        : buildWriterRef(this._graphName, this._writerId);
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

      // 4. Calculate lamport and parent from current ref state.
      // Start from this._lamport (set by _nextLamport() in createPatch()), which already
      // incorporates the globally-observed max Lamport tick via _maxObservedLamport.
      // This ensures a first-time writer whose own chain is empty still commits at a tick
      // above any previously-observed writer, winning LWW tiebreakers correctly.
      let lamport = this._lamport;
      let parentCommit = null;

      if (currentRefSha !== null && currentRefSha !== undefined && currentRefSha !== '') {
        parentCommit = currentRefSha;
        // Read the current patch commit to get its lamport timestamp and take the max,
        // so the chain stays monotonic even if the ref advanced since createPatch().
        const commitMessage = await this._persistence.showNode(currentRefSha);
        const kind = detectMessageKind(commitMessage);

        if (kind === 'patch') {
          let patchInfo;
          try {
            patchInfo = decodePatchMessage(commitMessage);
          } catch (err) {
            throw new Error(
              `Failed to parse lamport from writer ref ${writerRef}: ` +
              `commit ${currentRefSha} has invalid patch message format`,
              { cause: err }
            );
          }
          lamport = Math.max(this._lamport, patchInfo.lamport + 1);
        }
        // Non-patch ref (checkpoint, etc.): keep lamport from this._lamport
        // (already incorporates _maxObservedLamport), matching _nextLamport() behavior.
      }

      // 5. Build PatchV2 structure with correct lamport
      // Note: Dots were assigned using constructor lamport, but commit lamport may differ.
      // For now, we use the calculated lamport for the patch metadata.
      // The dots themselves are independent of patch lamport (they use VV counters).
      const schema = this._hasEdgeProps ? 3 : 2;
      // Lower canonical ops to raw form for the persisted patch
      const rawOps = /** @type {import('../types/WarpTypesV2.js').RawOpV2[]} */ (this._ops.map(lowerCanonicalOp));
      const patch = createPatchV2({
        schema,
        writer: this._writerId,
        lamport,
        context: vvSerialize(this._vv),
        ops: rawOps,
        reads: [...this._observedOperands].sort(),
        writes: [...this._writes].sort(),
      });

      // 6. Persist patch via PatchJournalPort (adapter owns encoding)
      //    Falls back to raw blob write when no journal is wired (legacy path).
      const patchBlobOid = this._patchJournal
        ? await this._patchJournal.writePatch(patch)
        : await this._persistence.writeBlob(patch);

      // 7. Create tree with the patch blob + any content blobs (deduplicated)
      // Format for mktree: "mode type oid\tpath"
      // Content is always stored via BlobStoragePort (CAS), producing tree OIDs.
      const treeEntries = [`100644 blob ${patchBlobOid}\tpatch.cbor`];
      const uniqueBlobs = [...new Set(this._contentBlobs)];
      for (const blobOid of uniqueBlobs) {
        treeEntries.push(`040000 tree ${blobOid}\t_content_${blobOid}`);
      }
      const treeOid = await this._persistence.writeTree(treeEntries);

      // 8. Create commit with proper trailers linking to the parent
      const commitMessage = encodePatchMessage({
        graph: this._graphName,
        writer: this._writerId,
        lamport,
        patchOid: patchBlobOid,
        schema,
        // "encrypted" is a legacy wire name meaning "patch blob stored externally
        // via patchBlobStorage" (see ADR-0002). The flag tells readers to retrieve
        // the blob via BlobStoragePort instead of reading it directly from Git.
        encrypted: this._patchJournal ? this._patchJournal.usesExternalStorage : false,
      });
      const parents = (parentCommit !== null && parentCommit !== '') ? [parentCommit] : [];
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
          this._logger.warn(`[warp] onCommitSuccess callback failed (sha=${newCommitSha}):`, { error: err });
        }
      }

      this._committed = true;
      return newCommitSha;
    } finally {
      this._committing = false;
    }
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
   * @returns {import('../crdt/VersionVector.js').default} The version vector as a
   *   `Map<string, number>` mapping writer IDs to their logical clock values
   */
  get versionVector() {
    return this._vv;
  }

  /**
   * Gets the set of observed operands (entities whose state was consulted).
   * Retains the `reads` name for API/serialization compatibility.
   * Internal field is `_observedOperands`.
   * @returns {ReadonlySet<string>}
   */
  get reads() {
    return new Set(this._observedOperands);
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
