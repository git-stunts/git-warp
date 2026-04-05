/**
 * Orchestrates a full logical bitmap index build from WarpStateV5.
 *
 * Extracts the visible projection (nodes, edges, properties) from materialized
 * state and delegates to LogicalBitmapIndexBuilder + PropertyIndexBuilder.
 *
 * @module domain/services/index/LogicalIndexBuildService
 */

import nullLogger from '../../utils/nullLogger.js';
import LogicalBitmapIndexBuilder from './LogicalBitmapIndexBuilder.js';
import PropertyIndexBuilder from './PropertyIndexBuilder.js';
import { orsetElements } from '../../crdt/ORSet.js';
import { decodeEdgeKey, decodePropKey, isEdgePropKey } from '../KeyCodec.js';
import { nodeVisibleV5, edgeVisibleV5 } from '../state/StateSerializerV5.js';
import WarpStream from '../../stream/WarpStream.js';
import { ReceiptShard } from '../../artifacts/IndexShard.js';

export default class LogicalIndexBuildService {
  /**
   * Creates a LogicalIndexBuildService with optional logger.
   *
   * @param {{ logger?: import('../../../ports/LoggerPort.js').default }} [options]
   */
  constructor(options = undefined) {
    const { logger } = options || {};
    this._logger = logger || nullLogger;
  }

  /**
   * Builds a complete logical index as a WarpStream of IndexShard records.
   *
   * The stream yields MetaShard, LabelShard, EdgeShard, PropertyShard,
   * and ReceiptShard instances in builder order. Pipe through
   * IndexShardEncodeTransform → GitBlobWriteTransform → TreeAssemblerSink
   * to persist.
   *
   * @param {import('../JoinReducer.js').WarpStateV5} state
   * @param {{ existingMeta?: Record<string, { nodeToGlobal: Record<string, number>, nextLocalId: number }>, existingLabels?: Record<string, number>|Array<[string, number]> }} [options]
   * @returns {{ stream: WarpStream<import('../../artifacts/IndexShard.js').IndexShard>, receipt: ReceiptShard }}
   */
  buildStream(state, options = {}) {
    const { indexBuilder, propBuilder } = this._populateBuilders(state, options);

    // Collect shards once — generators yield fresh iterators on each call,
    // so calling yieldShards() twice would re-iterate all bitmaps.
    const indexShards = [...indexBuilder.yieldShards()];
    const receiptShard = indexShards.find((s) => s instanceof ReceiptShard);
    if (!receiptShard) {
      throw new Error('LogicalIndexBuildService: index builder did not emit a ReceiptShard');
    }

    // Merge both builders' shard streams
    const stream = WarpStream.mux(
      WarpStream.from(indexShards),
      WarpStream.from(propBuilder.yieldShards()),
    );

    return { stream, receipt: /** @type {ReceiptShard} */ (receiptShard) };
  }

  /**
   * Populates both builders from state. Used by buildStream().
   *
   * @param {import('../JoinReducer.js').WarpStateV5} state
   * @param {{ existingMeta?: Record<string, { nodeToGlobal: Record<string, number>, nextLocalId: number }>, existingLabels?: Record<string, number>|Array<[string, number]> }} options
   * @returns {{ indexBuilder: LogicalBitmapIndexBuilder, propBuilder: PropertyIndexBuilder }}
   * @private
   */
  _populateBuilders(state, options) {
    const indexBuilder = new LogicalBitmapIndexBuilder();
    const propBuilder = new PropertyIndexBuilder();

    if (options.existingMeta) {
      for (const [shardKey, meta] of Object.entries(options.existingMeta)) {
        indexBuilder.loadExistingMeta(shardKey, meta);
      }
    }
    if (options.existingLabels) {
      indexBuilder.loadExistingLabels(options.existingLabels);
    }

    const aliveNodes = [...orsetElements(state.nodeAlive)].sort();
    for (const nodeId of aliveNodes) {
      indexBuilder.registerNode(nodeId);
      indexBuilder.markAlive(nodeId);
    }

    const visibleEdges = _collectVisibleEdges(state);
    const uniqueLabels = [...new Set(visibleEdges.map((e) => e.label))].sort();
    for (const label of uniqueLabels) {
      indexBuilder.registerLabel(label);
    }
    for (const { from, to, label } of visibleEdges) {
      indexBuilder.addEdge(from, to, label);
    }

    for (const [propKey, register] of state.prop) {
      if (isEdgePropKey(propKey)) { continue; }
      const { nodeId, propKey: key } = decodePropKey(propKey);
      if (nodeVisibleV5(state, nodeId)) {
        propBuilder.addProperty(nodeId, key, register.value);
      }
    }

    return { indexBuilder, propBuilder };
  }
}

/**
 * Collects and sorts visible edges from state.
 *
 * @param {import('../JoinReducer.js').WarpStateV5} state
 * @returns {Array<{from: string, to: string, label: string}>}
 */
function _collectVisibleEdges(state) {
  const visibleEdges = [];
  for (const edgeKey of orsetElements(state.edgeAlive)) {
    if (edgeVisibleV5(state, edgeKey)) {
      visibleEdges.push(decodeEdgeKey(edgeKey));
    }
  }
  visibleEdges.sort((a, b) => {
    if (a.from !== b.from) { return a.from < b.from ? -1 : 1; }
    if (a.to !== b.to) { return a.to < b.to ? -1 : 1; }
    if (a.label !== b.label) { return a.label < b.label ? -1 : 1; }
    return 0;
  });
  return visibleEdges;
}
