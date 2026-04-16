/**
 * QueryController — read-only query surface for materialized graph state.
 *
 * Thin facade composing QueryReads (graph reads), QueryContent
 * (blob access), and query/observer/worldline factory methods.
 */

import { cloneState } from '../JoinReducer.ts';
import QueryBuilder from '../query/QueryBuilder.ts';
import Observer from '../query/Observer.ts';
import { openDetachedGraph } from './detachedOpen.ts';
import Worldline from '../Worldline.ts';
import { computeTranslationCost } from '../TranslationCost.ts';
import { computeStateHash } from '../state/StateSerializer.ts';
import { toInternalStrandShape } from '../../utils/strandPublicShape.ts';
import { callInternalRuntimeMethod } from '../../utils/callInternalRuntimeMethod.ts';
import WorldlineSelector from '../../types/WorldlineSelector.ts';
import LiveSelector from '../../types/LiveSelector.ts';
import CoordinateSelector from '../../types/CoordinateSelector.ts';
import StrandSelector from '../../types/StrandSelector.ts';
import QueryError from '../../errors/QueryError.ts';
import type WarpState from '../state/WarpState.ts';
import type WarpRuntime from '../../WarpRuntime.ts';
import type { WarpGraphWithMixins } from '../../warp/_internal.ts';

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

/**
 * Assertion narrowing WarpRuntime to its _materializeGraph internal.
 * _materializeGraph is defined on WarpRuntime but typed loosely at
 * this boundary; the assertion narrows without a value-level cast.
 */
type MaterializableHost = { _materializeGraph: () => Promise<{ state: WarpState; stateHash: string | null }> };

function assertMaterializableHost(graph: WarpRuntime): asserts graph is WarpRuntime & MaterializableHost {
  void graph;
}

async function snapshotCurrent(graph: WarpRuntime): Promise<{ state: WarpState; stateHash: string }> {
  assertMaterializableHost(graph);
  const materialized = await graph._materializeGraph();
  if (materialized.stateHash === null) {
    throw new QueryError('_materializeGraph returned a null stateHash', {
      code: 'E_NO_STATE',
    });
  }
  return { state: cloneState(materialized.state), stateHash: materialized.stateHash };
}

async function snapshotWith(graph: WarpRuntime, state: WarpState): Promise<{ state: WarpState; stateHash: string }> {
  const stateHash = graph._stateHashService
    ? await graph._stateHashService.compute(state)
    : await computeStateHash(state, { crypto: graph._crypto, codec: graph._codec });
  return { state: cloneState(state), stateHash };
}

// ── Observer snapshot resolution ────────────────────────────────────

type ObserverOptions = { source?: ObserverSource };

async function resolveSnapshot(graph: WarpRuntime, options: ObserverOptions | undefined): Promise<{ state: WarpState; stateHash: string }> {
  const source = toSelector(options?.source);
  if (!source) {
    await (graph as WarpGraphWithMixins)._ensureFreshState();
    return await snapshotCurrent(graph);
  }
  return await resolveSourceSnapshot(graph, source);
}

async function resolveSourceSnapshot(graph: WarpRuntime, source: WorldlineSelector): Promise<{ state: WarpState; stateHash: string }> {
  if (source instanceof LiveSelector) {
    return await resolveLiveSnapshot(graph, source);
  }
  if (source instanceof CoordinateSelector) {
    return await resolveCoordinateSnapshot(graph, source);
  }
  if (source instanceof StrandSelector) {
    return await resolveStrandSnapshot(graph, source);
  }
  throw new QueryError(`unrecognized observer source kind: ${source.constructor.name}`, {
    code: 'E_OBSERVER_SOURCE_UNKNOWN',
    context: { sourceKind: source.constructor.name },
  });
}

async function resolveLiveSnapshot(graph: WarpRuntime, source: LiveSelector): Promise<{ state: WarpState; stateHash: string }> {
  const detached = await openDetachedGraph(graph);
  const state = await detached.materialize({ ceiling: source.ceiling ?? null });
  return await snapshotWith(detached, state);
}

async function resolveCoordinateSnapshot(graph: WarpRuntime, source: CoordinateSelector): Promise<{ state: WarpState; stateHash: string }> {
  const detached = await openDetachedGraph(graph);
  const state = await detached.materializeCoordinate({ frontier: source.frontier, ceiling: source.ceiling ?? null });
  return await snapshotWith(detached, state);
}

async function resolveStrandSnapshot(graph: WarpRuntime, source: StrandSelector): Promise<{ state: WarpState; stateHash: string }> {
  const detached = await openDetachedGraph(graph);
  const internal = toInternalStrandShape(source.toDTO());
  const state = await callInternalRuntimeMethod<WarpState>(detached, 'materializeStrand', internal.strandId, { ceiling: internal.ceiling ?? null });
  return await snapshotWith(detached, state);
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
  _host: WarpGraphWithMixins;

  constructor(hostGraph: WarpGraphWithMixins) {
    this._host = hostGraph;
  }
}

// ── Wire methods via defineProperty ──────────────────────────────────

function host(ctrl: QueryController): WarpGraphWithMixins { return ctrl._host; }

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

type EdgeImplResult<T> = (h: WarpGraphWithMixins, edge: { from: string; to: string; label: string }) => Promise<T>;

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
  return new Worldline({ graph: host(this), source: toSelector(options?.source) ?? new LiveSelector() });
});

wire('observer', async function (this: QueryController, nameOrConfig: string | ObserverConfig, configOrOptions?: ObserverConfig | ObserverOptions, maybeOptions?: ObserverOptions) {
  const { name, config, options } = normalizeObserverArgs(nameOrConfig, configOrOptions, maybeOptions);
  if (!config || !isValidMatch(config.match)) {
    throw new QueryError('observer config.match must be a non-empty string or non-empty array of strings', {
      code: 'E_OBSERVER_MATCH_TYPE',
    });
  }
  const h = host(this);
  const snapshot = await resolveSnapshot(h as WarpRuntime, options);
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
