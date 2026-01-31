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

import { createVersionVector, vvIncrement, vvClone, vvSerialize } from '../crdt/VersionVector.js';
import { orsetGetDots } from '../crdt/ORSet.js';
import {
  createNodeAddV2,
  createNodeRemoveV2,
  createEdgeAddV2,
  createEdgeRemoveV2,
  createPropSetV2,
  createPatchV2,
} from '../types/WarpTypesV2.js';
import { encodeEdgeKey } from './JoinReducer.js';

/**
 * Fluent builder for creating WARP v5 patches with dots and observed-remove semantics.
 */
export class PatchBuilderV2 {
  /**
   * Creates a new PatchBuilderV2.
   *
   * @param {Object} options
   * @param {string} options.writerId - This writer's ID
   * @param {number} options.lamport - Lamport timestamp for this patch
   * @param {import('../crdt/VersionVector.js').VersionVector} options.versionVector - Current version vector
   * @param {Function} options.getCurrentState - Function that returns the current materialized state
   */
  constructor({ writerId, lamport, versionVector, getCurrentState }) {
    /** @type {string} */
    this._writerId = writerId;

    /** @type {number} */
    this._lamport = lamport;

    /** @type {import('../crdt/VersionVector.js').VersionVector} */
    this._vv = vvClone(versionVector); // Clone to track local increments

    /** @type {Function} */
    this._getCurrentState = getCurrentState; // Function to get current materialized state

    /** @type {import('../types/WarpTypesV2.js').OpV2[]} */
    this._ops = [];
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
   * Builds the PatchV2 object.
   *
   * @returns {import('../types/WarpTypesV2.js').PatchV2} The constructed patch
   */
  build() {
    return createPatchV2({
      schema: 2,
      writer: this._writerId,
      lamport: this._lamport,
      context: this._vv,
      ops: this._ops,
    });
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
