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

type ObserverSource = { kind: string; [key: string]: unknown };

function toSelector(source: WorldlineSelector | ObserverSource | undefined): WorldlineSelector | undefined {
  if (!source) { return undefined; }
  return WorldlineSelector.from(source).clone();
}

// ── Snapshot helpers ────────────────────────────────────────────────

async function snapshotCurrent(graph: WarpRuntime): Promise<{ state: WarpState; stateHash: string }> {
  type Materializable = { _materializeGraph: () => Promise<{ state: WarpState; stateHash: string | null }> };
  const materialized = await (graph as unknown as Materializable)._materializeGraph();
  return { state: cloneState(materialized.state), stateHash: materialized.stateHash as string };
}

async function snapshotWith(graph: WarpRuntime, state: WarpState): Promise<{ state: WarpState; stateHash: string }> {
  type HashHost = { _stateHashService?: { compute(s: WarpState): Promise<string> } | null; _crypto: unknown; _codec: unknown };
  const h = graph as unknown as HashHost;
  const stateHash = h._stateHashService
    ? await h._stateHashService.compute(state)
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
  throw new QueryError(`unknown observer source kind: ${source.constructor.name}`, {
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
  const state = await callInternalRuntimeMethod(detached, 'materializeStrand', internal.strandId, { ceiling: internal.ceiling ?? null });
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

function isValidMatch(m: unknown): boolean {
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

function wire(name: string, fn: Function): void {
  Object.defineProperty(QueryController.prototype, name, {
    value: fn, writable: true, configurable: true, enumerable: false,
  });
}

function wireEdge(name: string, impl: (h: WarpGraphWithMixins, edge: { from: string; to: string; label: string }) => Promise<unknown>): void {
  wire(name, function (from: string, to: string, label: string) { return impl(host(this), { from, to, label }); });
}

// QueryReads delegates
wire('hasNode', function (nodeId: string) { return hasNodeImpl(host(this), nodeId); });
wire('getNodeProps', function (nodeId: string) { return getNodePropsImpl(host(this), nodeId); });
wire('getEdgeProps', function (from: string, to: string, label: string) { return getEdgePropsImpl(host(this), { from, to, label }); });
wire('neighbors', function (nodeId: string, direction: 'outgoing' | 'incoming' | 'both' = 'both', edgeLabel?: string) {
  return neighborsImpl(host(this), { nodeId, direction, ...(edgeLabel !== undefined ? { edgeLabel } : {}) });
});
wire('getStateSnapshot', function () { return getStateSnapshotImpl(host(this)); });
wire('getNodes', function () { return getNodesImpl(host(this)); });
wire('getEdges', function () { return getEdgesImpl(host(this)); });
wire('getPropertyCount', function () { return getPropertyCountImpl(host(this)); });

// QueryContent delegates
wire('getContentOid', function (nodeId: string) { return getContentOidImpl(host(this), nodeId); });
wire('getContentMeta', function (nodeId: string) { return getContentMetaImpl(host(this), nodeId); });
wire('getContent', function (nodeId: string) { return getContentImpl(host(this), nodeId); });
wire('getContentStream', function (nodeId: string) { return getContentStreamImpl(host(this), nodeId); });
wireEdge('getEdgeContentOid', getEdgeContentOidImpl);
wireEdge('getEdgeContentMeta', getEdgeContentMetaImpl);
wireEdge('getEdgeContent', getEdgeContentImpl);
wireEdge('getEdgeContentStream', getEdgeContentStreamImpl);

// Factory methods
wire('query', function () { return new QueryBuilder(host(this)); });
wire('worldline', function (options?: ObserverOptions) {
  return new Worldline({ graph: host(this), source: toSelector(options?.source) ?? new LiveSelector() });
});

wire('observer', async function (nameOrConfig: string | ObserverConfig, configOrOptions?: ObserverConfig | ObserverOptions, maybeOptions?: ObserverOptions) {
  const { name, config, options } = normalizeObserverArgs(nameOrConfig, configOrOptions, maybeOptions);
  if (!config || !isValidMatch(config.match)) {
    throw new QueryError('observer config.match must be a non-empty string or non-empty array of strings', {
      code: 'E_OBSERVER_MATCH_TYPE',
    });
  }
  const h = host(this);
  const snapshot = await resolveSnapshot(h as WarpRuntime, options);
  return new Observer({ name, config, graph: h, snapshot, source: options?.source });
});

wire('translationCost', async function (configA: ObserverConfig, configB: ObserverConfig) {
  const h = host(this);
  await h._ensureFreshState();
  return computeTranslationCost(configA, configB, h._cachedState as WarpState);
});
