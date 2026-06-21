/**
 * Observer - Read-only filtered view of a causal read model.
 *
 * Provides an observer that sees only nodes matching a glob pattern,
 * with property visibility controlled by expose/redact lists.
 * Edges are only visible when both endpoints pass the match filter.
 *
 * @module domain/services/query/Observer
 * @see Paper IV, Section 3 -- Observers as resource-bounded functors
 */

import QueryBuilder from './QueryBuilder.ts';
import StateQueryReadModel from './StateQueryReadModel.ts';
import VisibleQueryReadModel from './VisibleQueryReadModel.ts';
import LogicalTraversal from './LogicalTraversal.ts';
import ObserverAccumulation from './ObserverAccumulation.ts';
import ObserverBasis from './ObserverBasis.ts';
import ObserverPlan from './ObserverPlan.ts';
import ObserverReadingEnvelope, { type ObserverReadingEnvelopeFields } from './ObserverReadingEnvelope.ts';
import { createStateReader } from '../state/StateReader.ts';
import { matchGlob } from '../../utils/matchGlob.ts';
import QueryError from '../../errors/QueryError.ts';
import WorldlineSelector from '../../types/WorldlineSelector.ts';
import LiveSelector from '../../types/LiveSelector.ts';
import CoordinateSelector from '../../types/CoordinateSelector.ts';
import StrandSelector from '../../types/StrandSelector.ts';
import type { WorldlineSource } from '../../capabilities/QueryCapability.ts';
import type { VisibleStateReader } from '../../types/VisibleStateReader.ts';
import type { SnapshotPropValue } from '../snapshot/SnapshotPropValue.ts';
import type { WarpState } from '../JoinReducer.ts';
import type ObserverEmission from './ObserverEmission.ts';
import type {
  QueryReadModel,
  QueryReadModelOpenRequest,
  QueryReadModelProvider,
} from './QueryReadModelProvider.ts';

type VisibleNodeProps = Readonly<{ [key: string]: SnapshotPropValue }>;
type VisibleEdge = { from: string; to: string; label: string; props: VisibleNodeProps };
type ObserverSnapshot = { state: WarpState; stateHash: string };
type ObserverReadingEnvelopeOptions = Pick<
ObserverReadingEnvelopeFields,
'witnessRef' | 'shellRef' | 'pluralityRef' | 'receiptAnchors'
>;

export interface ObserverBacking {
  hasNode: (nodeId: string) => Promise<boolean>;
  getNodes: () => Promise<string[]>;
  getNodeProps: (nodeId: string) => Promise<VisibleNodeProps | null>;
  getEdges: () => Promise<VisibleEdge[]>;
  observer: (
    name: string,
    config: ObserverConfig,
    options: { source: WorldlineSource },
  ) => Promise<Observer>;
}

function toSelector(source: WorldlineSelector | WorldlineSource | null | undefined): WorldlineSelector | null {
  if (source === null || source === undefined) { return null; }
  return WorldlineSelector.from(source).clone();
}

function selectorToSource(source: WorldlineSelector): WorldlineSource {
  if (source instanceof LiveSelector) {
    return source.toDTO();
  }
  if (source instanceof CoordinateSelector) {
    return source.toDTO();
  }
  if (source instanceof StrandSelector) {
    return source.toDTO();
  }
  throw new QueryError(`unrecognized observer source kind: ${source.constructor.name}`, {
    code: 'E_OBSERVER_SOURCE_UNKNOWN',
    context: { sourceKind: source.constructor.name },
  });
}

function toFilterSet(list: string[] | undefined): Set<string> | null {
  return Array.isArray(list) && list.length > 0 ? new Set(list) : null;
}

function isKeyVisible(key: string, redactSet: Set<string> | null, exposeSet: Set<string> | null): boolean {
  if (redactSet !== null && redactSet.has(key)) { return false; }
  if (exposeSet !== null && !exposeSet.has(key)) { return false; }
  return true;
}

function filterProps(propsRecord: VisibleNodeProps, expose: string[] | undefined, redact: string[] | undefined): VisibleNodeProps {
  const redactSet = toFilterSet(redact);
  const exposeSet = toFilterSet(expose);
  const filtered: { [key: string]: SnapshotPropValue } = {};
  for (const [key, value] of Object.entries(propsRecord)) {
    if (isKeyVisible(key, redactSet, exposeSet)) {
      filtered[key] = value;
    }
  }
  return Object.freeze(filtered);
}

export interface ObserverConfig {
  match: string | string[];
  expose?: string[];
  redact?: string[];
  basis?: string[];
}

interface ObserverOptions {
  name: string;
  config: ObserverConfig;
  graph?: ObserverBacking;
  snapshot?: ObserverSnapshot;
  source?: WorldlineSelector | WorldlineSource;
  readModelProvider?: QueryReadModelProvider;
}

/**
 * Read-only observer view over a live read model or pinned state snapshot.
 */
export default class Observer {
  private _name!: string;
  private _matchPattern!: string | string[];
  private _expose: string[] | undefined;
  private _redact: string[] | undefined;
  private _basis!: ObserverBasis;
  private _graph!: ObserverBacking | null;
  private _snapshot!: ObserverSnapshot | null;
  private _source!: WorldlineSelector | null;
  private _stateReader!: VisibleStateReader | null;
  private _readModelProvider!: QueryReadModelProvider | null;
  traverse: LogicalTraversal;

  constructor({ name, config, graph, snapshot, source, readModelProvider }: ObserverOptions) {
    this._initIdentity(name, config);
    this._initBacking(graph, snapshot, source, readModelProvider);
    this.traverse = new LogicalTraversal(this.queryReadModelProvider());
  }

  private _initIdentity(name: string, config: ObserverConfig): void {
    this._name = name ?? 'observer';
    this._matchPattern = Array.isArray(config.match) ? [...config.match] : config.match;
    this._expose = config.expose ? [...config.expose] : undefined;
    this._redact = config.redact ? [...config.redact] : undefined;
    this._basis = ObserverBasis.from(config.basis);
  }

  private _initBacking(
    graph: ObserverBacking | undefined,
    snapshot: ObserverSnapshot | undefined,
    source: WorldlineSelector | WorldlineSource | undefined,
    readModelProvider: QueryReadModelProvider | undefined,
  ): void {
    this._graph = graph ?? null;
    this._snapshot = snapshot ?? null;
    this._source = toSelector(source ?? new LiveSelector());
    this._stateReader = snapshot ? createStateReader(snapshot.state) : null;
    this._readModelProvider = readModelProvider ?? null;
  }

  get name(): string {
    return this._name;
  }

  get source(): WorldlineSource | null {
    return this._source ? selectorToSource(this._source) : null;
  }

  get stateHash(): string | null {
    return this._snapshot ? this._snapshot.stateHash : null;
  }

  get basis(): ObserverBasis {
    return this._basis;
  }

  private _requireGraph(): ObserverBacking {
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
    if (!this._basis.isEmpty()) { config.basis = this._basis.toConfigValue(); }
    return config;
  }

  async seek(options?: { source?: WorldlineSource }): Promise<Observer> {
    const graph = this._requireGraph();
    const config = this._buildConfigSnapshot();
    const nextSource: WorldlineSelector = options?.source
      ? WorldlineSelector.from(options.source).clone()
      : new LiveSelector();
    return await graph.observer(this._name, config, { source: selectorToSource(nextSource) });
  }

  // ===========================================================================
  // Query read model provider
  // ===========================================================================

  queryReadModelProvider(): QueryReadModelProvider {
    return this;
  }

  async openQueryReadModel(request?: QueryReadModelOpenRequest): Promise<QueryReadModel> {
    if (this._readModelProvider !== null) {
      return new VisibleQueryReadModel({
        source: await this._readModelProvider.openQueryReadModel(request),
        visibility: this._queryVisibility(),
      });
    }

    if (this._snapshot !== null) {
      return new StateQueryReadModel({
        state: this._snapshot.state,
        stateHash: this._snapshot.stateHash,
        visibility: this._queryVisibility(),
      });
    }

    throw new QueryError('Observer query requires a snapshot or query read-model provider', {
      code: 'E_OBSERVER_QUERY_READ_MODEL',
    });
  }

  private _queryVisibility(): {
    readonly match: string | readonly string[];
    readonly expose?: readonly string[];
    readonly redact?: readonly string[];
  } {
    return {
      match: Array.isArray(this._matchPattern) ? [...this._matchPattern] : this._matchPattern,
      ...(this._expose !== undefined ? { expose: [...this._expose] } : {}),
      ...(this._redact !== undefined ? { redact: [...this._redact] } : {}),
    };
  }

  // ===========================================================================
  // Structural observer API
  // ===========================================================================

  async accumulate(): Promise<ObserverAccumulation> {
    let accumulation = ObserverAccumulation.empty(this._basis);
    const nodeIds = await this.getNodes();
    for (const nodeId of nodeIds) {
      const props = await this.getNodeProps(nodeId);
      if (props !== null) {
        accumulation = accumulation.includeNode(props);
      }
    }
    return accumulation.includeEdges((await this.getEdges()).length);
  }

  async emit(): Promise<ObserverEmission> {
    return (await this.accumulate()).emit();
  }

  plan(): ObserverPlan {
    return new ObserverPlan({
      name: this._name,
      match: Array.isArray(this._matchPattern) ? [...this._matchPattern] : this._matchPattern,
      ...(this._expose !== undefined ? { expose: [...this._expose] } : {}),
      ...(this._redact !== undefined ? { redact: [...this._redact] } : {}),
      basis: this._basis,
      source: this._source ?? new LiveSelector(),
    });
  }

  async readingEnvelope(options: ObserverReadingEnvelopeOptions = {}): Promise<ObserverReadingEnvelope> {
    return new ObserverReadingEnvelope({
      plan: this.plan(),
      payload: await this.emit(),
      stateHash: this.stateHash,
      ...options,
    });
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

  async getNodeProps(nodeId: string): Promise<VisibleNodeProps | null> {
    if (!matchGlob(this._matchPattern, nodeId)) { return null; }
    const propsRecord: VisibleNodeProps | null = this._stateReader
      ? this._stateReader.getNodeProps(nodeId)
      : await this._requireGraph().getNodeProps(nodeId);
    if (!propsRecord) { return null; }
    return filterProps(propsRecord, this._expose, this._redact);
  }

  // ===========================================================================
  // Edge API
  // ===========================================================================

  async getEdges(): Promise<VisibleEdge[]> {
    const allEdges: VisibleEdge[] = this._stateReader
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
    return new QueryBuilder(this.queryReadModelProvider());
  }
}
