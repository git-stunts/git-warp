/**
 * Orchestrates a full logical bitmap index build from WarpState.
 *
 * Extracts the visible projection (nodes, edges, properties) from materialized
 * state and delegates to LogicalBitmapIndexBuilder + PropertyIndexBuilder.
 *
 * @module domain/services/index/LogicalIndexBuildService
 */

import LogicalBitmapIndexBuilder from './LogicalBitmapIndexBuilder.ts';
import PropertyIndexBuilder from './PropertyIndexBuilder.ts';
import { decodeEdgeKey, decodePropKey, isEdgePropKey } from '../KeyCodec.ts';
import { nodeVisibleV5, edgeVisible } from '../state/StateSerializer.ts';
import WarpStream from '../../stream/WarpStream.ts';
import { ReceiptShard } from '../../artifacts/ReceiptShard.ts';
import IndexError from '../../errors/IndexError.ts';
import type WarpState from '../state/WarpState.ts';
import type { IndexShard } from '../../artifacts/IndexShard.ts';

export default class LogicalIndexBuildService {
  /**
   * Builds a complete logical index as a collected array of IndexShard records.
   *
   * Synchronous alternative to buildStream() for callers that need all
   * shards in memory (e.g., MaterializedViewService.build() which hydrates
   * an in-memory LogicalIndex).
   */
  buildShards(
    state: WarpState,
    options: {
      existingMeta?: Record<string, { nodeToGlobal: Record<string, number>; nextLocalId: number }>;
      existingLabels?: Record<string, number> | Array<[string, number]>;
    } = {},
  ): { shards: IndexShard[]; receipt: ReceiptShard } {
    const { indexBuilder, propBuilder } = this._populateBuilders(state, options);
    const indexShards = [...indexBuilder.yieldShards()];
    const propShards = [...propBuilder.yieldShards()];
    const receiptShardBase = indexShards.find((s) => s instanceof ReceiptShard);
    if (!(receiptShardBase instanceof ReceiptShard)) {
      throw new IndexError(
        'LogicalIndexBuildService: index builder did not emit a ReceiptShard',
        { code: 'E_INDEX_NO_RECEIPT_SHARD' },
      );
    }
    return { shards: [...indexShards, ...propShards], receipt: receiptShardBase };
  }

  /**
   * Builds a complete logical index as a WarpStream of IndexShard records.
   *
   * The stream yields MetaShard, LabelShard, EdgeShard, PropertyShard,
   * and ReceiptShard instances in builder order. Pipe through
   * IndexShardEncodeTransform → GitBlobWriteTransform → TreeAssemblerSink
   * to persist.
   */
  buildStream(
    state: WarpState,
    options: {
      existingMeta?: Record<string, { nodeToGlobal: Record<string, number>; nextLocalId: number }>;
      existingLabels?: Record<string, number> | Array<[string, number]>;
    } = {},
  ): { stream: WarpStream<IndexShard>; receipt: ReceiptShard } {
    const { indexBuilder, propBuilder } = this._populateBuilders(state, options);

    // Collect shards once — generators yield fresh iterators on each call,
    // so calling yieldShards() twice would re-iterate all bitmaps.
    const indexShards = [...indexBuilder.yieldShards()];
    const receiptShardBase = indexShards.find((s) => s instanceof ReceiptShard);
    if (!(receiptShardBase instanceof ReceiptShard)) {
      throw new IndexError(
        'LogicalIndexBuildService: index builder did not emit a ReceiptShard',
        { code: 'E_INDEX_NO_RECEIPT_SHARD' },
      );
    }

    // Merge both builders' shard streams
    const stream = WarpStream.mux(
      WarpStream.from(indexShards),
      WarpStream.from(propBuilder.yieldShards()),
    );

    return { stream, receipt: receiptShardBase };
  }

  private _populateBuilders(
    state: WarpState,
    options: {
      existingMeta?: Record<string, { nodeToGlobal: Record<string, number>; nextLocalId: number }>;
      existingLabels?: Record<string, number> | Array<[string, number]>;
    },
  ): { indexBuilder: LogicalBitmapIndexBuilder; propBuilder: PropertyIndexBuilder } {
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

    const aliveNodes = [...state.nodeAlive.elements()].sort();
    for (const nodeId of aliveNodes) {
      indexBuilder.registerNode(nodeId);
      indexBuilder.markAlive(nodeId);
    }

    const visibleEdges = collectVisibleEdges(state);
    const uniqueLabels = [...new Set(visibleEdges.map((e) => e.label))].sort();
    for (const label of uniqueLabels) {
      indexBuilder.registerLabel(label);
    }
    for (const { from, to, label } of visibleEdges) {
      indexBuilder.addEdge(from, to, label);
    }

    for (const [propKey, register] of state.prop) {
      if (isEdgePropKey(propKey)) { continue; }
      const { nodeId, propKey: key } = decodePropKey(propKey) as { nodeId: string; propKey: string };
      if (nodeVisibleV5(state, nodeId)) {
        propBuilder.addProperty(nodeId, key, register.value);
      }
    }

    return { indexBuilder, propBuilder };
  }
}

function collectVisibleEdges(state: WarpState): Array<{ from: string; to: string; label: string }> {
  const visibleEdges: Array<{ from: string; to: string; label: string }> = [];
  for (const edgeKey of state.edgeAlive.elements()) {
    if (edgeVisible(state, edgeKey)) {
      visibleEdges.push(decodeEdgeKey(edgeKey) as { from: string; to: string; label: string });
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
