/**
 * Read-only query operations on a materialized graph.
 *
 * 20 methods covering node/edge queries, content access,
 * observers, worldlines, and traversal via QueryBuilder.
 */

import type SnapshotWarpState from '../services/snapshot/SnapshotWarpState.ts';
import type { SnapshotPropValue } from '../services/snapshot/SnapshotPropValue.ts';
import type { ContentMeta } from '../types/ContentMeta.ts';
import type QueryBuilder from '../services/query/QueryBuilder.ts';
import type Worldline from '../services/Worldline.ts';
import type Observer from '../services/query/Observer.ts';
import type { Aperture } from '../types/Aperture.ts';

/** Observer lens configuration for match/expose/redact filtering. */
export type ObserverConfig = Aperture;

/** Translation cost breakdown between two observer configurations. */
export type TranslationCostResult = {
  cost: number;
  breakdown: { nodeLoss: number; edgeLoss: number; propLoss: number };
};

export type QueryPropertyBag = Readonly<{ [key: string]: SnapshotPropValue }>;

/** Source selector for worldline/observer pinning. */
export type WorldlineSource =
  | { kind: 'live'; ceiling?: number | null }
  | {
      kind: 'coordinate';
      frontier: Map<string, string> | Record<string, string>;
      ceiling?: number | null;
      checkpointSha?: string;
    }
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
  props: QueryPropertyBag;
};

export default abstract class QueryCapability {
  /** Return whether a visible node exists. */
  abstract hasNode(_nodeId: string): Promise<boolean>;

  /** Return visible node properties, or null when the node is absent. */
  abstract getNodeProps(_nodeId: string): Promise<QueryPropertyBag | null>;

  /** Return visible edge properties, or null when the edge is absent. */
  abstract getEdgeProps(_from: string, _to: string, _label: string): Promise<QueryPropertyBag | null>;

  /** Return neighboring nodes reachable by direction and optional label. */
  abstract neighbors(
    _nodeId: string,
    _direction?: 'outgoing' | 'incoming' | 'both',
    _edgeLabel?: string,
  ): Promise<NeighborEntry[]>;

  /** Return a snapshot of visible state, or null when no state is loaded. */
  abstract getStateSnapshot(): Promise<SnapshotWarpState | null>;

  /** Return visible node ids. */
  abstract getNodes(): Promise<string[]>;

  /** Return visible edge entries. */
  abstract getEdges(): Promise<VisibleEdge[]>;

  /** Return the count of visible node and edge properties. */
  abstract getPropertyCount(): Promise<number>;

  /** Create a fluent query builder over the current read model. */
  abstract query(): QueryBuilder;

  /** Create a worldline read handle pinned by the given options. */
  abstract worldline(_options?: WorldlineOptions): Worldline;

  /** Create an observer lens for filtered visible reads. */
  abstract observer(
    _nameOrConfig: string | ObserverConfig,
    _configOrOptions?: ObserverConfig | ObserverOptions,
    _options?: ObserverOptions,
  ): Promise<Observer>;

  /** Estimate translation cost between two observer configurations. */
  abstract translationCost(
    _configA: ObserverConfig,
    _configB: ObserverConfig,
  ): Promise<TranslationCostResult>;

  /** Return the content blob OID attached to a node, if any. */
  abstract getContentOid(_nodeId: string): Promise<string | null>;

  /** Return content metadata attached to a node, if any. */
  abstract getContentMeta(_nodeId: string): Promise<ContentMeta | null>;

  /** Return content bytes attached to a node, if any. */
  abstract getContent(_nodeId: string): Promise<Uint8Array | null>;

  /** Return the content blob OID attached to an edge, if any. */
  abstract getEdgeContentOid(_from: string, _to: string, _label: string): Promise<string | null>;

  /** Return content metadata attached to an edge, if any. */
  abstract getEdgeContentMeta(_from: string, _to: string, _label: string): Promise<ContentMeta | null>;

  /** Return content bytes attached to an edge, if any. */
  abstract getEdgeContent(_from: string, _to: string, _label: string): Promise<Uint8Array | null>;

  /** Return a node content byte stream, if content exists. */
  abstract getContentStream(_nodeId: string): Promise<AsyncIterable<Uint8Array> | null>;

  /** Return an edge content byte stream, if content exists. */
  abstract getEdgeContentStream(_from: string, _to: string, _label: string): Promise<AsyncIterable<Uint8Array> | null>;
}
