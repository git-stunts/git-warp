/**
 * Orchestrates a full logical bitmap index build from WarpStateV5.
 *
 * Extracts the visible projection (nodes, edges, properties) from materialized
 * state and delegates to LogicalBitmapIndexBuilder + PropertyIndexBuilder.
 *
 * @module domain/services/index/LogicalIndexBuildService
 */

import defaultCodec from '../../utils/defaultCodec.js';
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
   * Creates a LogicalIndexBuildService with optional codec and logger.
   * @param {{ codec?: import('../../../ports/CodecPort.js').default, logger?: import('../../../ports/LoggerPort.js').default }} [options] - Service dependencies
   */
  constructor(options = undefined) {
    const { codec, logger } = options || {};
    this._codec = codec || defaultCodec;
    this._logger = logger || nullLogger;
  }

  /**
   * Builds a complete logical index from materialized state.
   *
   * @param {import('../JoinReducer.js').WarpStateV5} state
   * @param {{ existingMeta?: Record<string, { nodeToGlobal: Record<string, number>, nextLocalId: number }>, existingLabels?: Record<string, number>|Array<[string, number]> }} [options]
   * @returns {{ tree: Record<string, Uint8Array>, receipt: Record<string, unknown> }}
   */
  build(state, options = {}) {
    const { indexBuilder, propBuilder } = this._populateBuilders(state, options);

    const indexTree = indexBuilder.serialize();
    const propTree = propBuilder.serialize();
    const tree = { ...indexTree, ...propTree };

    const receiptBlob = indexTree['receipt.cbor'];
    if (!receiptBlob) { throw new Error('Missing receipt.cbor in index tree'); }
    const receipt = /** @type {Record<string, unknown>} */ (this._codec.decode(receiptBlob));

    return { tree, receipt };
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
   * Populates both builders from state. Shared between build() and buildStream().
   *
   * @param {import('../JoinReducer.js').WarpStateV5} state
   * @param {{ existingMeta?: Record<string, { nodeToGlobal: Record<string, number>, nextLocalId: number }>, existingLabels?: Record<string, number>|Array<[string, number]> }} options
   * @returns {{ indexBuilder: LogicalBitmapIndexBuilder, propBuilder: PropertyIndexBuilder }}
   * @private
   */
  _populateBuilders(state, options) {
    const indexBuilder = new LogicalBitmapIndexBuilder({ codec: this._codec });
    const propBuilder = new PropertyIndexBuilder({ codec: this._codec });

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
