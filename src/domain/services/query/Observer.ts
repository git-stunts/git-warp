/**
 * Observer - Read-only filtered view of a materialized WarpRuntime.
 *
 * Provides an observer that sees only nodes matching a glob pattern,
 * with property visibility controlled by expose/redact lists.
 * Edges are only visible when both endpoints pass the match filter.
 *
 * @module domain/services/query/Observer
 * @see Paper IV, Section 3 -- Observers as resource-bounded functors
 */

import QueryBuilder from './QueryBuilder.ts';
import LogicalTraversal from './LogicalTraversal.ts';
import { createStateReader } from '../state/StateReader.js';
import { decodeEdgeKey } from '../KeyCodec.ts';
import { matchGlob } from '../../utils/matchGlob.ts';
import QueryError from '../../errors/QueryError.ts';
import WorldlineSelector from '../../types/WorldlineSelector.ts';
import LiveSelector from '../../types/LiveSelector.ts';
import type { WarpState } from '../JoinReducer.ts';
import type WarpRuntime from '../../WarpRuntime.ts';
import type { WorldlineSource } from '../../capabilities/QueryCapability.ts';
import type { VisibleStateReader } from '../../../../index.js';
import type NeighborProviderPort from '../../../ports/NeighborProviderPort.ts';

interface NeighborEntry {
  neighborId: string;
  label: string;
}

type AdjacencyMaps = {
  outgoing: Map<string, NeighborEntry[]>;
  incoming: Map<string, NeighborEntry[]>;
};

function toSelector(source: WorldlineSelector | { kind: string; [key: string]: unknown } | null | undefined): WorldlineSelector | null {
  if (source === null || source === undefined) { return null; }
  return WorldlineSelector.from(source as Parameters<typeof WorldlineSelector.from>[0]).clone();
}

function toFilterSet(list: string[] | undefined): Set<string> | null {
  return Array.isArray(list) && list.length > 0 ? new Set(list) : null;
}

function isKeyVisible(key: string, redactSet: Set<string> | null, exposeSet: Set<string> | null): boolean {
  if (redactSet !== null && redactSet.has(key)) { return false; }
  if (exposeSet !== null && !exposeSet.has(key)) { return false; }
  return true;
}

function filterProps(propsRecord: Record<string, unknown>, expose: string[] | undefined, redact: string[] | undefined): Record<string, unknown> {
  const redactSet = toFilterSet(redact);
  const exposeSet = toFilterSet(expose);
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(propsRecord)) {
    if (isKeyVisible(key, redactSet, exposeSet)) {
      filtered[key] = value;
    }
  }
  return filtered;
}

function sortNeighbors(list: NeighborEntry[]): void {
  list.sort((a, b) => {
    if (a.neighborId !== b.neighborId) { return a.neighborId < b.neighborId ? -1 : 1; }
    return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
  });
}

function isVisibleEdge(ctx: { state: WarpState; pattern: string | string[] }, from: string, to: string): boolean {
  return ctx.state.nodeAlive.contains(from) &&
    ctx.state.nodeAlive.contains(to) &&
    matchGlob(ctx.pattern, from) &&
    matchGlob(ctx.pattern, to);
}

function pushAdjacencyEntry(map: Map<string, NeighborEntry[]>, key: string, entry: NeighborEntry): void {
  if (!map.has(key)) { map.set(key, []); }
  map.get(key)!.push(entry);
}

function buildAdjacencyFromEdges(state: WarpState, pattern: string | string[]): AdjacencyMaps {
  const outgoing = new Map<string, NeighborEntry[]>();
  const incoming = new Map<string, NeighborEntry[]>();
  const ctx = { state, pattern };

  for (const edgeKey of state.edgeAlive.elements()) {
    const { from, to, label } = decodeEdgeKey(edgeKey);
    if (!isVisibleEdge(ctx, from, to)) { continue; }
    pushAdjacencyEntry(outgoing, from, { neighborId: to, label });
    pushAdjacencyEntry(incoming, to, { neighborId: from, label });
  }

  for (const list of outgoing.values()) { sortNeighbors(list); }
  for (const list of incoming.values()) { sortNeighbors(list); }
  return { outgoing, incoming };
}

function collectNodeEdges(
  id: string,
  edges: NeighborEntry[],
  ctx: { visibleSet: Set<string>; outgoing: Map<string, NeighborEntry[]>; incoming: Map<string, NeighborEntry[]> },
): void {
  const filtered = edges.filter((e) => ctx.visibleSet.has(e.neighborId));
  if (filtered.length > 0) {
    ctx.outgoing.set(id, filtered);
  }
  for (const { neighborId, label } of filtered) {
    if (!ctx.incoming.has(neighborId)) { ctx.incoming.set(neighborId, []); }
    ctx.incoming.get(neighborId)!.push({ neighborId: id, label });
  }
}

async function buildAdjacencyViaProvider(provider: NeighborProviderPort, visibleNodes: string[]): Promise<AdjacencyMaps> {
  const visibleSet = new Set(visibleNodes);
  const outgoing = new Map<string, NeighborEntry[]>();
  const incoming = new Map<string, NeighborEntry[]>();
  const ctx = { visibleSet, outgoing, incoming };

  const BATCH = 64;
  for (let i = 0; i < visibleNodes.length; i += BATCH) {
    const chunk = visibleNodes.slice(i, i + BATCH);
    const results = await Promise.all(
      chunk.map((id: string) => provider.getNeighbors(id, 'out').then((edges: NeighborEntry[]) => ({ id, edges })))
    );
    for (const { id, edges } of results) {
      collectNodeEdges(id, edges, ctx);
    }
  }

  for (const list of incoming.values()) { sortNeighbors(list); }
  return { outgoing, incoming };
}

export interface ObserverConfig {
  match: string | string[];
  expose?: string[];
  redact?: string[];
}

interface ObserverOptions {
  name: string;
  config: ObserverConfig;
  graph?: WarpRuntime;
  snapshot?: { state: WarpState; stateHash: string };
  source?: WorldlineSelector | WorldlineSource;
}

/**
 * Read-only observer view of a materialized WarpRuntime state.
 */
export default class Observer {
  private _name!: string;
  private _matchPattern!: string | string[];
  private _expose: string[] | undefined;
  private _redact: string[] | undefined;
  private _graph!: WarpRuntime | null;
  private _snapshot!: { state: WarpState; stateHash: string } | null;
  private _source!: WorldlineSelector | null;
  private _stateReader: VisibleStateReader | null;
  private _snapshotAdjacency!: AdjacencyMaps | null;
  // Public traversal API — duck-typed by LogicalTraversal constructor
  traverse: LogicalTraversal;

  constructor({ name, config, graph, snapshot, source }: ObserverOptions) {
    this._initIdentity(name, config);
    this._initBacking(graph, snapshot, source);
    void this._materializeGraph;

    this.traverse = new LogicalTraversal(this as unknown as WarpRuntime);
  }

  private _initIdentity(name: string, config: ObserverConfig): void {
    this._name = name ?? 'observer';
    this._matchPattern = Array.isArray(config.match) ? [...config.match] : config.match;
    this._expose = config.expose ? [...config.expose] : undefined;
    this._redact = config.redact ? [...config.redact] : undefined;
  }

  private _initBacking(
    graph: WarpRuntime | undefined,
    snapshot: { state: WarpState; stateHash: string } | undefined,
    source: WorldlineSelector | WorldlineSource | undefined,
  ): void {
    this._graph = graph ?? null;
    this._snapshot = snapshot ?? null;
    this._source = toSelector(source as WorldlineSelector | { kind: string; [key: string]: unknown } | undefined ?? new LiveSelector());
    this._stateReader = snapshot ? createStateReader(snapshot.state) : null;
    this._snapshotAdjacency = null;
  }

  get name(): string {
    return this._name;
  }

  get source(): WorldlineSource | null {
    return this._source ? this._source.toDTO() as WorldlineSource : null;
  }

  get stateHash(): string | null {
    return this._snapshot ? this._snapshot.stateHash : null;
  }

  private _requireGraph(): WarpRuntime {
    if (!this._graph) {
      throw new QueryError(
        'Observer has no live backing graph',
        { code: 'E_OBSERVER_NO_GRAPH' },
      );
    }
    return this._graph;
  }

  private _buildConfigSnapshot(): ObserverConfig {
    const config: ObserverConfig = {
      match: Array.isArray(this._matchPattern) ? [...this._matchPattern] : this._matchPattern,
    };
    if (this._expose) { config.expose = [...this._expose]; }
    if (this._redact) { config.redact = [...this._redact]; }
    return config;
  }

  async seek(options?: { source?: WorldlineSource }): Promise<Observer> {
    const graph = this._requireGraph();
    const config = this._buildConfigSnapshot();
    const nextSource: WorldlineSelector = options?.source
      ? WorldlineSelector.from(options.source as Parameters<typeof WorldlineSelector.from>[0]).clone()
      : new LiveSelector();

    return await (graph as unknown as { observer(name: string, config: ObserverConfig, opts: { source: WorldlineSource }): Promise<Observer> })
      .observer(this._name, config, { source: nextSource.toDTO() as WorldlineSource });
  }

  // ===========================================================================
  // Internal: State access (used by QueryBuilder and LogicalTraversal)
  // ===========================================================================

  async _materializeGraph(): Promise<{ state: unknown; stateHash: string; adjacency: AdjacencyMaps }> {
    if (this._snapshot) {
      if (!this._snapshotAdjacency) {
        this._snapshotAdjacency = buildAdjacencyFromEdges(this._snapshot.state, this._matchPattern);
      }
      return {
        state: this._snapshot.state,
        stateHash: this._snapshot.stateHash,
        adjacency: this._snapshotAdjacency,
      };
    }

    const graph = this._requireGraph();
    const materialized = await (graph as unknown as {
      _materializeGraph(): Promise<{
        state: WarpState;
        stateHash: string;
        provider?: unknown;
        adjacency: AdjacencyMaps;
      }>;
    })._materializeGraph();
    const { state, stateHash } = materialized;

    let adjacency: AdjacencyMaps;

    if (materialized.provider) {
      const visibleNodes = state.nodeAlive.elements()
        .filter((id) => matchGlob(this._matchPattern, id));
      adjacency = await buildAdjacencyViaProvider(materialized.provider, visibleNodes);
    } else {
      adjacency = buildAdjacencyFromEdges(state, this._matchPattern);
    }

    return { state, stateHash, adjacency };
  }

  // ===========================================================================
  // Node API
  // ===========================================================================

  async hasNode(nodeId: string): Promise<boolean> {
    if (!matchGlob(this._matchPattern, nodeId)) { return false; }
    if (this._stateReader) { return this._stateReader.hasNode(nodeId); }
    return await this._requireGraph().hasNode(nodeId);
  }

  async getNodes(): Promise<string[]> {
    const allNodes: string[] = this._stateReader
      ? this._stateReader.getNodes()
      : await this._requireGraph().getNodes();
    return allNodes.filter((id) => matchGlob(this._matchPattern, id));
  }

  async getNodeProps(nodeId: string): Promise<Record<string, unknown> | null> {
    if (!matchGlob(this._matchPattern, nodeId)) { return null; }
    const propsRecord: Record<string, unknown> | null = this._stateReader
      ? this._stateReader.getNodeProps(nodeId)
      : await this._requireGraph().getNodeProps(nodeId);
    if (!propsRecord) { return null; }
    return filterProps(propsRecord, this._expose, this._redact);
  }

  // ===========================================================================
  // Edge API
  // ===========================================================================

  async getEdges(): Promise<Array<{ from: string; to: string; label: string; props: Record<string, unknown> }>> {
    const allEdges: Array<{ from: string; to: string; label: string; props: Record<string, unknown> }> = this._stateReader
      ? this._stateReader.getEdges()
      : await this._requireGraph().getEdges();
    return allEdges
      .filter(
        (e) => matchGlob(this._matchPattern, e.from) && matchGlob(this._matchPattern, e.to)
      )
      .map((e) => {
        const filtered = filterProps(e.props, this._expose, this._redact);
        return { ...e, props: filtered };
      });
  }

  // ===========================================================================
  // Query API
  // ===========================================================================

  query(): QueryBuilder {
    return new QueryBuilder(this as unknown as ConstructorParameters<typeof QueryBuilder>[0]);
  }
}
