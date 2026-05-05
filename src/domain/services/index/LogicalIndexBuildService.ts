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
import WarpStream from '../../stream/WarpStream.ts';
import { ReceiptShard } from '../../artifacts/ReceiptShard.ts';
import IndexError from '../../errors/IndexError.ts';
import type WarpState from '../state/WarpState.ts';
import type { IndexShard } from '../../artifacts/IndexShard.ts';
import type { LWWRegister } from '../../crdt/LWW.ts';
import type { PropValue } from '../../types/PropValue.ts';
import type StateSession from '../../orset/session/StateSession.ts';
import {
  collectAliveNodeIdsFromSession,
  collectAliveNodeSetFromSession,
  collectVisibleEdgesFromSession,
  type VisibleEdgeRecord,
} from '../state/SessionVisibleGraph.ts';

type ExistingMeta = Record<string, { nodeToGlobal: Record<string, number>; nextLocalId: number }>;
type ExistingLabels = Record<string, number> | Array<[string, number]>;
type PropertyRegisters = Map<string, LWWRegister<PropValue>>;

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
      existingMeta?: ExistingMeta;
      existingLabels?: ExistingLabels;
    } = {},
  ): { shards: IndexShard[]; receipt: ReceiptShard } {
    const { indexBuilder, propBuilder } = this._populateBuilders(state, options);
    return this._collectShards(indexBuilder, propBuilder);
  }

  async buildShardsFromSession(args: {
    session: StateSession;
    prop: PropertyRegisters;
    existingMeta?: ExistingMeta;
    existingLabels?: ExistingLabels;
  }): Promise<{ shards: IndexShard[]; receipt: ReceiptShard }> {
    const { indexBuilder, propBuilder } = await this._populateBuildersFromSession(args);
    return this._collectShards(indexBuilder, propBuilder);
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
      existingMeta?: ExistingMeta;
      existingLabels?: ExistingLabels;
    } = {},
  ): { stream: WarpStream<IndexShard>; receipt: ReceiptShard } {
    const { indexBuilder, propBuilder } = this._populateBuilders(state, options);
    const indexShards = [...indexBuilder.yieldShards()];
    const receiptShardBase = findReceiptShard(indexShards);
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
      existingMeta?: ExistingMeta;
      existingLabels?: ExistingLabels;
    },
  ): { indexBuilder: LogicalBitmapIndexBuilder; propBuilder: PropertyIndexBuilder } {
    const { indexBuilder, propBuilder } = this._createBuilders(options);
    const aliveNodes = [...state.nodeAlive.elements()].sort();
    const visibleEdges = collectVisibleEdges(state);
    const aliveNodeSet = new Set(aliveNodes);
    this._populateVisibleData({
      indexBuilder,
      propBuilder,
      aliveNodes,
      aliveNodeSet,
      visibleEdges,
      prop: state.prop,
    });
    return { indexBuilder, propBuilder };
  }

  private async _populateBuildersFromSession(args: {
    session: StateSession;
    prop: PropertyRegisters;
    existingMeta?: ExistingMeta;
    existingLabels?: ExistingLabels;
  }): Promise<{ indexBuilder: LogicalBitmapIndexBuilder; propBuilder: PropertyIndexBuilder }> {
    const { indexBuilder, propBuilder } = this._createBuilders(args);
    const aliveNodes = await collectAliveNodeIdsFromSession(args.session);
    const aliveNodeSet = await collectAliveNodeSetFromSession(args.session);
    const visibleEdges = await collectVisibleEdgesFromSession(
      args.session,
      aliveNodeSet,
    );
    this._populateVisibleData({
      indexBuilder,
      propBuilder,
      aliveNodes,
      aliveNodeSet,
      visibleEdges,
      prop: args.prop,
    });
    return { indexBuilder, propBuilder };
  }

  private _createBuilders(options: {
    existingMeta?: ExistingMeta;
    existingLabels?: ExistingLabels;
  }): { indexBuilder: LogicalBitmapIndexBuilder; propBuilder: PropertyIndexBuilder } {
    const indexBuilder = new LogicalBitmapIndexBuilder();
    const propBuilder = new PropertyIndexBuilder();

    if (options.existingMeta !== undefined) {
      for (const [shardKey, meta] of Object.entries(options.existingMeta)) {
        indexBuilder.loadExistingMeta(shardKey, meta);
      }
    }
    if (options.existingLabels !== undefined) {
      indexBuilder.loadExistingLabels(options.existingLabels);
    }

    return { indexBuilder, propBuilder };
  }

  private _populateVisibleData(args: {
    indexBuilder: LogicalBitmapIndexBuilder;
    propBuilder: PropertyIndexBuilder;
    aliveNodes: ReadonlyArray<string>;
    aliveNodeSet: ReadonlySet<string>;
    visibleEdges: ReadonlyArray<VisibleEdgeRecord>;
    prop: PropertyRegisters;
  }): void {
    for (const nodeId of args.aliveNodes) {
      args.indexBuilder.registerNode(nodeId);
      args.indexBuilder.markAlive(nodeId);
    }

    const uniqueLabels = [...new Set(args.visibleEdges.map((edge) => edge.label))].sort();
    for (const label of uniqueLabels) {
      args.indexBuilder.registerLabel(label);
    }
    for (const edge of args.visibleEdges) {
      args.indexBuilder.addEdge(edge.from, edge.to, edge.label);
    }

    for (const [propKey, register] of args.prop) {
      if (isEdgePropKey(propKey)) {
        continue;
      }
      const decodedProp = decodePropKey(propKey);
      if (args.aliveNodeSet.has(decodedProp.nodeId)) {
        args.propBuilder.addProperty(
          decodedProp.nodeId,
          decodedProp.propKey,
          register.value,
        );
      }
    }
  }

  private _collectShards(
    indexBuilder: LogicalBitmapIndexBuilder,
    propBuilder: PropertyIndexBuilder,
  ): { shards: IndexShard[]; receipt: ReceiptShard } {
    const indexShards = [...indexBuilder.yieldShards()];
    const propShards = [...propBuilder.yieldShards()];
    const receipt = findReceiptShard(indexShards);
    return {
      shards: [...indexShards, ...propShards],
      receipt,
    };
  }
}

function collectVisibleEdges(state: WarpState): Array<{ from: string; to: string; label: string }> {
  const visibleEdges: Array<{ from: string; to: string; label: string }> = [];
  const aliveNodeSet = new Set(state.nodeAlive.elements());
  for (const edgeKey of state.edgeAlive.elements()) {
    const edge = decodeEdgeKey(edgeKey);
    if (aliveNodeSet.has(edge.from) && aliveNodeSet.has(edge.to)) {
      visibleEdges.push(edge);
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

function findReceiptShard(indexShards: ReadonlyArray<IndexShard>): ReceiptShard {
  const receiptShardBase = indexShards.find((shard) => shard instanceof ReceiptShard);
  if (!(receiptShardBase instanceof ReceiptShard)) {
    throw new IndexError(
      'LogicalIndexBuildService: index builder did not emit a ReceiptShard',
      { code: 'E_INDEX_NO_RECEIPT_SHARD' },
    );
  }
  return receiptShardBase;
}
