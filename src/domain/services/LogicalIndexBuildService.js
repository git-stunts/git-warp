/**
 * Orchestrates a full logical bitmap index build from WarpStateV5.
 *
 * Extracts the visible projection (nodes, edges, properties) from materialized
 * state and delegates to LogicalBitmapIndexBuilder + PropertyIndexBuilder.
 *
 * @module domain/services/LogicalIndexBuildService
 */

import defaultCodec from '../utils/defaultCodec.js';
import nullLogger from '../utils/nullLogger.js';
import LogicalBitmapIndexBuilder from './LogicalBitmapIndexBuilder.js';
import PropertyIndexBuilder from './PropertyIndexBuilder.js';
import { orsetElements } from '../crdt/ORSet.js';
import { decodeEdgeKey, decodePropKey, isEdgePropKey } from './KeyCodec.js';
import { nodeVisibleV5, edgeVisibleV5 } from './StateSerializerV5.js';

export default class LogicalIndexBuildService {
  /**
   * @param {{ codec?: import('../../ports/CodecPort.js').default, logger?: import('../../ports/LoggerPort.js').default }} [options]
   */
  constructor(options = undefined) {
    const { codec, logger } = options || {};
    this._codec = codec || defaultCodec;
    this._logger = logger || nullLogger;
  }

  /**
   * Builds a complete logical index from materialized state.
   *
   * @param {import('./JoinReducer.js').WarpStateV5} state
   * @param {{ existingMeta?: Record<string, { nodeToGlobal: Record<string, number>, nextLocalId: number }>, existingLabels?: Record<string, number>|Array<[string, number]> }} [options]
   * @returns {{ tree: Record<string, Uint8Array>, receipt: Record<string, unknown> }}
   */
  build(state, options = {}) {
    const indexBuilder = new LogicalBitmapIndexBuilder({ codec: this._codec });
    const propBuilder = new PropertyIndexBuilder({ codec: this._codec });

    // Seed existing data for stability
    if (options.existingMeta) {
      for (const [shardKey, meta] of Object.entries(options.existingMeta)) {
        indexBuilder.loadExistingMeta(shardKey, meta);
      }
    }
    if (options.existingLabels) {
      indexBuilder.loadExistingLabels(options.existingLabels);
    }

    // 1. Register and mark alive all visible nodes (sorted for deterministic ID assignment)
    const aliveNodes = [...orsetElements(state.nodeAlive)].sort();
    for (const nodeId of aliveNodes) {
      indexBuilder.registerNode(nodeId);
      indexBuilder.markAlive(nodeId);
    }

    // 2. Collect visible edges and register labels (sorted for deterministic ID assignment)
    const visibleEdges = [];
    for (const edgeKey of orsetElements(state.edgeAlive)) {
      if (edgeVisibleV5(state, edgeKey)) {
        visibleEdges.push(decodeEdgeKey(edgeKey));
      }
    }
    visibleEdges.sort((a, b) => {
      if (a.from !== b.from) {
        return a.from < b.from ? -1 : 1;
      }
      if (a.to !== b.to) {
        return a.to < b.to ? -1 : 1;
      }
      if (a.label !== b.label) {
        return a.label < b.label ? -1 : 1;
      }
      return 0;
    });
    const uniqueLabels = [...new Set(visibleEdges.map(e => e.label))].sort();
    for (const label of uniqueLabels) {
      indexBuilder.registerLabel(label);
    }

    // 3. Add edges
    for (const { from, to, label } of visibleEdges) {
      indexBuilder.addEdge(from, to, label);
    }

    // 4. Build property index from visible props
    for (const [propKey, register] of state.prop) {
      if (isEdgePropKey(propKey)) {
        continue;
      }
      const { nodeId, propKey: key } = decodePropKey(propKey);
      if (nodeVisibleV5(state, nodeId)) {
        propBuilder.addProperty(nodeId, key, register.value);
      }
    }

    // 5. Serialize
    const indexTree = indexBuilder.serialize();
    const propTree = propBuilder.serialize();
    const tree = { ...indexTree, ...propTree };

    const receipt = /** @type {Record<string, unknown>} */ (this._codec.decode(indexTree['receipt.cbor']));

    return { tree, receipt };
  }
}
