/**
 * QueryController — read-only query surface for materialized graph state.
 *
 * Thin facade composing QueryReads (graph reads), QueryContent
 * (blob access), and query/observer/worldline factory methods.
 */

import { cloneState } from '../JoinReducer.ts';
import QueryBuilder from '../query/QueryBuilder.ts';
import Observer from '../query/Observer.ts';
import Worldline from '../Worldline.ts';
import { computeTranslationCost } from '../TranslationCost.ts';
import { toInternalStrandShape } from '../../utils/strandPublicShape.ts';
import type { DetachedGraphReadSurface } from '../../capabilities/DetachedGraphFactory.ts';
import WorldlineSelector from '../../types/WorldlineSelector.ts';
import LiveSelector from '../../types/LiveSelector.ts';
import CoordinateSelector from '../../types/CoordinateSelector.ts';
import StrandSelector from '../../types/StrandSelector.ts';
import QueryError from '../../errors/QueryError.ts';
import type DetachedGraphFactory from '../../capabilities/DetachedGraphFactory.ts';
import type QueryCapability from '../../capabilities/QueryCapability.ts';
import type WarpState from '../state/WarpState.ts';
import type { MaterializedReadGraph, QueryContentHost, QueryReadHost } from './ReadGraphHost.ts';

import {
  hasNodeImpl, getNodePropsImpl, getEdgePropsImpl, neighborsImpl,
  getStateSnapshotImpl, getNodesImpl, getEdgesImpl, getPropertyCountImpl,
} from './QueryReads.ts';

import {
  getContentOidImpl, getContentMetaImpl, getContentImpl, getContentStreamImpl,
  getEdgeContentOidImpl, getEdgeContentMetaImpl, getEdgeContentImpl, getEdgeContentStreamImpl,
} from './QueryContent.ts';

// ── Observer source helpers ─────────────────────────────────────────

/**
 * The raw selector input accepted by callers of `observer()` and
 * `worldline()`. Mirrors the parameter shape of `WorldlineSelector.from`.
 */
export type ObserverSource = Exclude<Parameters<typeof WorldlineSelector.from>[0], WorldlineSelector | null | undefined>;

function toSelector(source: WorldlineSelector | ObserverSource | undefined): WorldlineSelector | undefined {
  if (!source) { return undefined; }
  return WorldlineSelector.from(source).clone();
}

// ── Snapshot helpers ────────────────────────────────────────────────

type QueryObserverFactoryHost = {
  observer(config: ObserverConfig, options?: ObserverOptions): Promise<Observer>;
  observer(name: string, config: ObserverConfig, options?: ObserverOptions): Promise<Observer>;
};

type MaterializableHost = QueryReadHost & QueryContentHost & QueryObserverFactoryHost & Pick<QueryCapability, 'hasNode' | 'getNodes' | 'getNodeProps' | 'getEdges'> & {
  _materializeGraph(): Promise<MaterializedReadGraph>;
};

type QueryStateHasher = (state: WarpState) => Promise<string>;

type QueryControllerDeps = {
  hostGraph: MaterializableHost;
  graphCloner: DetachedGraphFactory;
  hashState: QueryStateHasher;
};

type QuerySnapshot = {
  state: WarpState;
  stateHash: string;
};

async function snapshotCurrent(graph: MaterializableHost): Promise<QuerySnapshot> {
  const materialized = await graph._materializeGraph();
  return { state: cloneState(materialized.state), stateHash: materialized.stateHash };
}

// ── Observer snapshot resolution ────────────────────────────────────

type ObserverOptions = { source?: ObserverSource };

async function resolveSnapshot(
  deps: QueryControllerDeps,
  options: ObserverOptions | undefined,
): Promise<QuerySnapshot> {
  const source = toSelector(options?.source);
  if (!source) {
    await deps.hostGraph._ensureFreshState();
    return await snapshotCurrent(deps.hostGraph);
  }
  return await resolveSourceSnapshot(deps, source);
}

async function resolveSourceSnapshot(
  deps: QueryControllerDeps,
  source: WorldlineSelector,
): Promise<QuerySnapshot> {
  if (source instanceof LiveSelector) {
    return await resolveLiveSnapshot(deps, source);
  }
  if (source instanceof CoordinateSelector) {
    return await resolveCoordinateSnapshot(deps, source);
  }
  if (source instanceof StrandSelector) {
    return await resolveStrandSnapshot(deps, source);
  }
  throw new QueryError(`unrecognized observer source kind: ${source.constructor.name}`, {
    code: 'E_OBSERVER_SOURCE_UNKNOWN',
    context: { sourceKind: source.constructor.name },
  });
}

async function openDetachedObserverGraph(
  deps: QueryControllerDeps,
): Promise<DetachedGraphReadSurface> {
  return await deps.graphCloner.openReadOnly();
}

async function resolveLiveSnapshot(
  deps: QueryControllerDeps,
  source: LiveSelector,
): Promise<QuerySnapshot> {
  const detached = await openDetachedObserverGraph(deps);
  const materialized = await detached._materializeGraph({ ceiling: source.ceiling ?? null });
  return {
    state: cloneState(materialized.state),
    stateHash: materialized.stateHash,
  };
}

async function resolveCoordinateSnapshot(
  deps: QueryControllerDeps,
  source: CoordinateSelector,
): Promise<QuerySnapshot> {
  const detached = await openDetachedObserverGraph(deps);
  const materialized = await detached._materializeCoordinateGraph({ frontier: source.frontier, ceiling: source.ceiling ?? null });
  return {
    state: cloneState(materialized.state),
    stateHash: materialized.stateHash,
  };
}

async function resolveStrandSnapshot(
  deps: QueryControllerDeps,
  source: StrandSelector,
): Promise<QuerySnapshot> {
  const detached = await openDetachedObserverGraph(deps);
  const internal = toInternalStrandShape(source.toDTO());
  const materialized = await detached._materializeStrandGraph(internal.strandId, {
    ceiling: internal.ceiling ?? null,
  });
  return {
    state: cloneState(materialized.state),
    stateHash: materialized.stateHash,
  };
}

// ── Observer argument normalization ─────────────────────────────────

type ObserverConfig = { match: string | string[]; expose?: string[]; redact?: string[] };

type NormalizedObserverArgs = {
  name: string;
  config: ObserverConfig | undefined;
  options: ObserverOptions | undefined;
};

function normalizeObserverArgs(nameOrConfig: string | ObserverConfig, configOrOptions?: ObserverConfig | ObserverOptions, maybeOptions?: ObserverOptions): NormalizedObserverArgs {
  if (typeof nameOrConfig === 'string') {
    return { name: nameOrConfig, config: configOrOptions as ObserverConfig | undefined, options: maybeOptions };
  }
  return { name: 'observer', config: nameOrConfig, options: configOrOptions as ObserverOptions | undefined };
}

function isValidMatch(m: string | string[]): boolean {
  if (typeof m === 'string') { return true; }
  return Array.isArray(m) && m.length > 0 && m.every((i) => typeof i === 'string');
}

// ── Controller class ────────────────────────────────────────────────

export default class QueryController {
  _host: MaterializableHost;
  _graphCloner: DetachedGraphFactory;
  _hashState: QueryStateHasher;

  declare hasNode: QueryCapability['hasNode'];
  declare getNodeProps: QueryCapability['getNodeProps'];
  declare getEdgeProps: QueryCapability['getEdgeProps'];
  declare neighbors: QueryCapability['neighbors'];
  declare getStateSnapshot: QueryCapability['getStateSnapshot'];
  declare getNodes: QueryCapability['getNodes'];
  declare getEdges: QueryCapability['getEdges'];
  declare getPropertyCount: QueryCapability['getPropertyCount'];
  declare query: QueryCapability['query'];
  declare worldline: QueryCapability['worldline'];
  declare observer: QueryCapability['observer'];
  declare translationCost: QueryCapability['translationCost'];
  declare getContentOid: QueryCapability['getContentOid'];
  declare getContentMeta: QueryCapability['getContentMeta'];
  declare getContent: QueryCapability['getContent'];
  declare getEdgeContentOid: QueryCapability['getEdgeContentOid'];
  declare getEdgeContentMeta: QueryCapability['getEdgeContentMeta'];
  declare getEdgeContent: QueryCapability['getEdgeContent'];
  declare getContentStream: QueryCapability['getContentStream'];
  declare getEdgeContentStream: QueryCapability['getEdgeContentStream'];

  constructor(deps: QueryControllerDeps) {
    this._host = deps.hostGraph;
    this._graphCloner = deps.graphCloner;
    this._hashState = deps.hashState;
  }
}

// ── Wire methods via defineProperty ──────────────────────────────────

function host(ctrl: QueryController): MaterializableHost { return ctrl._host; }
function snapshotDeps(ctrl: QueryController): QueryControllerDeps {
  return {
    hostGraph: ctrl._host,
    graphCloner: ctrl._graphCloner,
    hashState: ctrl._hashState,
  };
}

/**
 * CallableFunction is the least-information return shape for a
 * dispatch wrapper — the actual per-method types live on the
 * declaration-file surface exposed to callers.
 */
function wire(name: string, fn: CallableFunction): void {
  Object.defineProperty(QueryController.prototype, name, {
    value: fn, writable: true, configurable: true, enumerable: false,
  });
}

type EdgeImplResult<T> = (h: MaterializableHost, edge: { from: string; to: string; label: string }) => Promise<T>;

function wireEdge<T>(name: string, impl: EdgeImplResult<T>): void {
  wire(name, function (this: QueryController, from: string, to: string, label: string) { return impl(host(this), { from, to, label }); });
}

// QueryReads delegates
wire('hasNode', function (this: QueryController, nodeId: string) { return hasNodeImpl(host(this), nodeId); });
wire('getNodeProps', function (this: QueryController, nodeId: string) { return getNodePropsImpl(host(this), nodeId); });
wire('getEdgeProps', function (this: QueryController, from: string, to: string, label: string) { return getEdgePropsImpl(host(this), { from, to, label }); });
wire('neighbors', function (this: QueryController, nodeId: string, direction: 'outgoing' | 'incoming' | 'both' = 'both', edgeLabel?: string) {
  return neighborsImpl(host(this), { nodeId, direction, ...(edgeLabel !== undefined ? { edgeLabel } : {}) });
});
wire('getStateSnapshot', function (this: QueryController) { return getStateSnapshotImpl(host(this)); });
wire('getNodes', function (this: QueryController) { return getNodesImpl(host(this)); });
wire('getEdges', function (this: QueryController) { return getEdgesImpl(host(this)); });
wire('getPropertyCount', function (this: QueryController) { return getPropertyCountImpl(host(this)); });

// QueryContent delegates
wire('getContentOid', function (this: QueryController, nodeId: string) { return getContentOidImpl(host(this), nodeId); });
wire('getContentMeta', function (this: QueryController, nodeId: string) { return getContentMetaImpl(host(this), nodeId); });
wire('getContent', function (this: QueryController, nodeId: string) { return getContentImpl(host(this), nodeId); });
wire('getContentStream', function (this: QueryController, nodeId: string) { return getContentStreamImpl(host(this), nodeId); });
wireEdge('getEdgeContentOid', getEdgeContentOidImpl);
wireEdge('getEdgeContentMeta', getEdgeContentMetaImpl);
wireEdge('getEdgeContent', getEdgeContentImpl);
wireEdge('getEdgeContentStream', getEdgeContentStreamImpl);

// Factory methods
wire('query', function (this: QueryController) { return new QueryBuilder(host(this)); });
wire('worldline', function (this: QueryController, options?: ObserverOptions) {
  return new Worldline({
    graph: host(this),
    graphCloner: this._graphCloner,
    source: toSelector(options?.source) ?? new LiveSelector(),
  });
});

wire('observer', async function (this: QueryController, nameOrConfig: string | ObserverConfig, configOrOptions?: ObserverConfig | ObserverOptions, maybeOptions?: ObserverOptions) {
  const { name, config, options } = normalizeObserverArgs(nameOrConfig, configOrOptions, maybeOptions);
  if (!config || !isValidMatch(config.match)) {
    throw new QueryError('observer config.match must be a non-empty string or non-empty array of strings', {
      code: 'E_OBSERVER_MATCH_TYPE',
    });
  }
  const h = host(this);
  const snapshot = await resolveSnapshot(snapshotDeps(this), options);
  const sourceSelector = options?.source !== undefined ? toSelector(options.source) : undefined;
  return new Observer({
    name, config, graph: h, snapshot,
    ...(sourceSelector !== undefined ? { source: sourceSelector } : {}),
  });
});

wire('translationCost', async function (this: QueryController, configA: ObserverConfig, configB: ObserverConfig) {
  const h = host(this);
  await h._ensureFreshState();
  return computeTranslationCost(configA, configB, h._cachedState as WarpState);
});
