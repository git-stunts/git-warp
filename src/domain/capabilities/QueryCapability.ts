/**
 * Read-only query operations on a materialized graph.
 *
 * 20 methods covering node/edge queries, content access,
 * observers, worldlines, and traversal via QueryBuilder.
 */

import type { WarpState } from '../services/JoinReducer.ts';
import type { ContentMeta } from '../types/ContentMeta.ts';
import type QueryBuilder from '../services/query/QueryBuilder.js';
import type Worldline from '../services/Worldline.ts';
import type Observer from '../services/query/Observer.js';

/** Observer lens configuration for match/expose/redact filtering. */
export type ObserverConfig = {
  match: string | string[];
  expose?: string[];
  redact?: string[];
};

/** Translation cost breakdown between two observer configurations. */
export type TranslationCostResult = {
  cost: number;
  breakdown: { nodeLoss: number; edgeLoss: number; propLoss: number };
};

/** Source selector for worldline/observer pinning. */
export type WorldlineSource =
  | { kind: 'live'; ceiling?: number | null }
  | { kind: 'coordinate'; frontier: Map<string, string> | Record<string, string>; ceiling?: number | null }
  | { kind: 'strand'; strandId: string; ceiling?: number | null };

/** Options for worldline creation. */
export type WorldlineOptions = {
  source?: WorldlineSource;
};

/** Options for observer creation. */
export type ObserverOptions = {
  source?: WorldlineSource;
};

/** Neighbor entry returned by the neighbors() method. */
export type NeighborEntry = {
  nodeId: string;
  label: string;
  direction: 'outgoing' | 'incoming';
};

/** Edge entry returned by getEdges(). */
export type VisibleEdge = {
  from: string;
  to: string;
  label: string;
  props: Record<string, unknown>;
};

export default abstract class QueryCapability {
  abstract hasNode(_nodeId: string): Promise<boolean>;
  abstract getNodeProps(_nodeId: string): Promise<Record<string, unknown> | null>;
  abstract getEdgeProps(_from: string, _to: string, _label: string): Promise<Record<string, unknown> | null>;
  abstract neighbors(
    _nodeId: string,
    _direction?: 'outgoing' | 'incoming' | 'both',
    _edgeLabel?: string,
  ): Promise<NeighborEntry[]>;
  abstract getStateSnapshot(): Promise<WarpState | null>;
  abstract getNodes(): Promise<string[]>;
  abstract getEdges(): Promise<VisibleEdge[]>;
  abstract getPropertyCount(): Promise<number>;
  abstract query(): QueryBuilder;
  abstract worldline(_options?: WorldlineOptions): Worldline;
  abstract observer(
    _nameOrConfig: string | ObserverConfig,
    _configOrOptions?: ObserverConfig | ObserverOptions,
    _options?: ObserverOptions,
  ): Promise<Observer>;
  abstract translationCost(
    _configA: ObserverConfig,
    _configB: ObserverConfig,
  ): Promise<TranslationCostResult>;
  abstract getContentOid(_nodeId: string): Promise<string | null>;
  abstract getContentMeta(_nodeId: string): Promise<ContentMeta | null>;
  abstract getContent(_nodeId: string): Promise<Uint8Array | null>;
  abstract getEdgeContentOid(_from: string, _to: string, _label: string): Promise<string | null>;
  abstract getEdgeContentMeta(_from: string, _to: string, _label: string): Promise<ContentMeta | null>;
  abstract getEdgeContent(_from: string, _to: string, _label: string): Promise<Uint8Array | null>;
  abstract getContentStream(_nodeId: string): Promise<AsyncIterable<Uint8Array> | null>;
  abstract getEdgeContentStream(_from: string, _to: string, _label: string): Promise<AsyncIterable<Uint8Array> | null>;
}
