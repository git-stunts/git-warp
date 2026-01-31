/**
 * PatchBuilder - Fluent API for building and committing WARP patches.
 *
 * Provides a builder pattern for constructing graph mutations that can be
 * atomically committed as a single patch.
 *
 * @module domain/services/PatchBuilder
 * @see WARP Spec Section 11.2
 */

import { encode } from '../../infrastructure/codecs/CborCodec.js';
import { encodePatchMessage, decodePatchMessage } from './WarpMessageCodec.js';
import { buildWriterRef } from '../utils/RefLayout.js';
import {
  createNodeAdd,
  createNodeTombstone,
  createEdgeAdd,
  createEdgeTombstone,
  createPropSet,
  createInlineValue,
} from '../types/WarpTypes.js';

/**
 * Fluent builder for creating and committing WARP patches.
 */
export default class PatchBuilder {
  /**
   * Creates a new PatchBuilder.
   *
   * @param {Object} options
   * @param {import('../../ports/GraphPersistencePort.js').default} options.persistence - Git adapter
   * @param {string} options.graphName - Graph namespace
   * @param {string} options.writerId - This writer's ID
   */
  constructor({ persistence, graphName, writerId }) {
    /** @type {import('../../ports/GraphPersistencePort.js').default} */
    this._persistence = persistence;

    /** @type {string} */
    this._graphName = graphName;

    /** @type {string} */
    this._writerId = writerId;

    /** @type {import('../types/WarpTypes.js').OpV1[]} */
    this._ops = [];
  }

  /**
   * Adds a node to the graph.
   *
   * @param {string} nodeId - The node ID to add
   * @returns {PatchBuilder} This builder for chaining
   *
   * @example
   * builder.addNode('user:alice');
   */
  addNode(nodeId) {
    this._ops.push(createNodeAdd(nodeId));
    return this;
  }

  /**
   * Removes (tombstones) a node from the graph.
   *
   * @param {string} nodeId - The node ID to remove
   * @returns {PatchBuilder} This builder for chaining
   *
   * @example
   * builder.removeNode('user:alice');
   */
  removeNode(nodeId) {
    this._ops.push(createNodeTombstone(nodeId));
    return this;
  }

  /**
   * Adds an edge between two nodes.
   *
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {string} label - Edge label/type
   * @returns {PatchBuilder} This builder for chaining
   *
   * @example
   * builder.addEdge('user:alice', 'user:bob', 'follows');
   */
  addEdge(from, to, label) {
    this._ops.push(createEdgeAdd(from, to, label));
    return this;
  }

  /**
   * Removes (tombstones) an edge between two nodes.
   *
   * @param {string} from - Source node ID
   * @param {string} to - Target node ID
   * @param {string} label - Edge label/type
   * @returns {PatchBuilder} This builder for chaining
   *
   * @example
   * builder.removeEdge('user:alice', 'user:bob', 'follows');
   */
  removeEdge(from, to, label) {
    this._ops.push(createEdgeTombstone(from, to, label));
    return this;
  }

  /**
   * Sets a property on a node.
   *
   * @param {string} nodeId - The node ID to set the property on
   * @param {string} key - Property key
   * @param {*} value - Property value (will be stored inline)
   * @returns {PatchBuilder} This builder for chaining
   *
   * @example
   * builder.setProperty('user:alice', 'name', 'Alice');
   */
  setProperty(nodeId, key, value) {
    this._ops.push(createPropSet(nodeId, key, createInlineValue(value)));
    return this;
  }

  /**
   * Gets the number of operations in the patch.
   *
   * @returns {number} The number of operations
   */
  get operationCount() {
    return this._ops.length;
  }

  /**
   * Commits the patch to the graph.
   *
   * @returns {Promise<string>} The commit SHA of the new patch
   * @throws {Error} If the patch is empty (no operations)
   *
   * @example
   * const sha = await builder
   *   .addNode('user:alice')
   *   .setProperty('user:alice', 'name', 'Alice')
   *   .commit();
   */
  async commit() {
    // 1. Reject empty patches
    if (this._ops.length === 0) {
      throw new Error('Cannot commit empty patch: no operations added');
    }

    // 2. Get next lamport timestamp
    const writerRef = buildWriterRef(this._graphName, this._writerId);
    const currentRefSha = await this._persistence.readRef(writerRef);

    let lamport = 1;
    let parentCommit = null;

    if (currentRefSha) {
      // Read the current patch commit to get its lamport timestamp
      const commitMessage = await this._persistence.showNode(currentRefSha);
      const patchInfo = decodePatchMessage(commitMessage);
      lamport = patchInfo.lamport + 1;
      parentCommit = currentRefSha;
    }

    // 3. Build PatchV1 structure
    /** @type {import('../types/WarpTypes.js').PatchV1} */
    const patch = {
      schema: 1,
      writer: this._writerId,
      lamport,
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

    // 7. Create patch commit message
    const commitMessage = encodePatchMessage({
      graph: this._graphName,
      writer: this._writerId,
      lamport,
      patchOid: patchBlobOid,
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

    // 10. Return the new commit SHA
    return newCommitSha;
  }
}
