/**
 * MaterializeController — CRDT state replay from patches.
 *
 * Three materialization pipelines:
 * 1. materialize() — full or checkpoint-incremental, live frontier
 * 2. materializeCoordinate() — explicit frontier snapshot
 * 3. materializeAt() — specific checkpoint SHA
 */

import { reduceV5, createEmptyState, cloneState } from '../JoinReducer.ts';
import { isV5CheckpointSchema, materializeIncremental } from '../state/CheckpointService.js';
import { ProvenanceIndex } from '../provenance/ProvenanceIndex.js';
import { diffStates, isEmptyDiff } from '../state/StateDiff.js';
import { decodePatchMessage, detectMessageKind } from '../codec/WarpMessageCodec.js';
import { decodeEdgeKey } from '../KeyCodec.js';
import { computeStateHashV5 } from '../state/StateSerializerV5.js';
import { createFrontier, updateFrontier } from '../Frontier.js';
import { buildSeekCacheKey } from '../../utils/seekCacheKey.ts';
import BitmapNeighborProvider from '../index/BitmapNeighborProvider.js';
import { QueryError } from '../../warp/_internal.ts';
import { buildWriterRef } from '../../utils/RefLayout.ts';
import { openDetachedGraph } from './detachedOpen.ts';
import {
  freezePublicState, freezeWithReceipts,
  normalizeFrontierInput, normalizeExplicitCeiling,
  frontiersEqual, maxLamportInPatches,
} from './MaterializeHelpers.ts';
import {
  tryReadCoordinateCache, persistSeekCacheEntry, restoreIndexFromCache,
} from './MaterializeCache.ts';
import type WarpRuntime from '../../WarpRuntime.js';
import type WarpState from '../state/WarpState.ts';
import type { TickReceipt } from '../../types/TickReceipt.ts';
import type { PatchDiff } from '../../types/PatchDiff.ts';
import type { WarpGraphWithMixins } from '../../warp/_internal.ts';
import type { CorePersistence } from '../../types/WarpPersistence.ts';

import type Patch from '../../types/Patch.ts';

type MaterializeHost = WarpGraphWithMixins;
type PatchEntry = { patch: Patch; sha: string };

// ── Lamport tracking ────────────────────────────────────────────────

async function scanFrontierLamport(host: MaterializeHost, frontier: Map<string, string>): Promise<void> {
  for (const tipSha of frontier.values()) {
    await scanOneTipCommit(host, tipSha);
  }
}

async function scanOneTipCommit(host: MaterializeHost, tipSha: string): Promise<void> {
  try {
    const msg = await host._persistence.showNode(tipSha);
    if (detectMessageKind(msg) !== 'patch') { return; }
    const { lamport } = decodePatchMessage(msg);
    if (lamport > host._maxObservedLamport) {
      host._maxObservedLamport = lamport;
    }
  } catch { /* best-effort */ }
}

function updateMaxLamport(host: MaterializeHost, patches: PatchEntry[]): void {
  const max = maxLamportInPatches(patches);
  if (max > host._maxObservedLamport) {
    host._maxObservedLamport = max;
  }
}

// ── Patch collection ────────────────────────────────────────────────

async function collectPatchesForFrontier(host: MaterializeHost, params: { frontier: Map<string, string>; ceiling: number | null }): Promise<PatchEntry[]> {
  const allPatches: PatchEntry[] = [];
  for (const writerId of params.frontier.keys()) {
    const tipSha = params.frontier.get(writerId);
    if (typeof tipSha !== 'string' || tipSha.length === 0) { continue; }
    await collectWriterPatches(host, tipSha, params.ceiling, allPatches);
  }
  return allPatches;
}

async function collectWriterPatches(host: MaterializeHost, tipSha: string, ceiling: number | null, out: PatchEntry[]): Promise<void> {
  const writerPatches = await host._loadPatchChainFromSha(tipSha);
  for (const entry of writerPatches) {
    if (ceiling === null || (entry.patch.lamport ?? 0) <= ceiling) {
      out.push(entry);
    }
  }
}

// ── Provenance index building ───────────────────────────────────────

function buildProvenanceFromPatches(patches: PatchEntry[], base?: ProvenanceIndex): ProvenanceIndex {
  const index = base ? base.clone() : new ProvenanceIndex();
  for (const { patch, sha } of patches) {
    index.addPatch(sha, patch.reads, patch.writes);
  }
  return index;
}

// ── Adjacency building ──────────────────────────────────────────────

type NeighborEdge = { neighborId: string; label: string };

function initAdjacencyList(map: Map<string, NeighborEdge[]>, key: string): NeighborEdge[] {
  let list = map.get(key);
  if (!list) {
    list = [];
    map.set(key, list);
  }
  return list;
}

function sortNeighborList(list: NeighborEdge[]): void {
  list.sort((a, b) => {
    if (a.neighborId !== b.neighborId) {
      return a.neighborId < b.neighborId ? -1 : 1;
    }
    return a.label < b.label ? -1 : a.label > b.label ? 1 : 0;
  });
}

function buildAdjacency(state: WarpState): { outgoing: Map<string, NeighborEdge[]>; incoming: Map<string, NeighborEdge[]> } {
  const outgoing = new Map<string, NeighborEdge[]>();
  const incoming = new Map<string, NeighborEdge[]>();

  for (const edgeKey of state.edgeAlive.elements()) {
    const { from, to, label } = decodeEdgeKey(edgeKey);
    if (!state.nodeAlive.contains(from) || !state.nodeAlive.contains(to)) { continue; }
    initAdjacencyList(outgoing, from).push({ neighborId: to, label });
    initAdjacencyList(incoming, to).push({ neighborId: from, label });
  }

  for (const list of outgoing.values()) { sortNeighborList(list); }
  for (const list of incoming.values()) { sortNeighborList(list); }
  return { outgoing, incoming };
}

// ── Reduce dispatch ─────────────────────────────────────────────────

type ReduceResult = { state: WarpState; receipts?: TickReceipt[]; diff?: PatchDiff };

type ReducerInput = Parameters<typeof reduceV5>[0];

function toReducerInput(patches: PatchEntry[]): ReducerInput {
  return patches as ReducerInput;
}

function reduceWithReceipts(patches: PatchEntry[], base: WarpState | undefined): ReduceResult {
  const r = reduceV5(toReducerInput(patches), base, { receipts: true });
  const typed = r as { state: WarpState; receipts: TickReceipt[] };
  return { state: typed.state, receipts: typed.receipts };
}

function reduceWithDiff(patches: PatchEntry[], base: WarpState | undefined): ReduceResult {
  const r = reduceV5(toReducerInput(patches), base, { trackDiff: true });
  const typed = r as { state: WarpState; diff: PatchDiff };
  return { state: typed.state, diff: typed.diff };
}

function reducePlain(patches: PatchEntry[], base: WarpState | undefined): ReduceResult {
  return { state: reduceV5(toReducerInput(patches), base) as WarpState };
}

function reducePatches(patches: PatchEntry[], base: WarpState | undefined, params: { receipts: boolean; wantDiff: boolean }): ReduceResult {
  if (params.receipts) { return reduceWithReceipts(patches, base); }
  if (params.wantDiff) { return reduceWithDiff(patches, base); }
  return reducePlain(patches, base);
}

// ── State caching ───────────────────────────────────────────────────

async function computeHash(host: MaterializeHost, state: WarpState): Promise<string> {
  const svc = host._stateHashService;
  if (svc) { return await svc.compute(state); }
  return await computeStateHashV5(state, { crypto: host._crypto, codec: host._codec });
}

async function setMaterializedState(host: MaterializeHost, ctrl: MaterializeController, state: WarpState, diff?: PatchDiff): Promise<void> {
  host._cachedState = state;
  host._stateDirty = false;
  host._versionVector = state.observedFrontier.clone();

  const stateHash = await computeHash(host, state);
  const adjacency = resolveAdjacency(host, state, stateHash);
  host._materializedGraph = { state, stateHash, adjacency };
  host._buildView(state, stateHash, diff);
}

function resolveAdjacency(host: MaterializeHost, state: WarpState, stateHash: string): { outgoing: Map<string, NeighborEdge[]>; incoming: Map<string, NeighborEdge[]> } {
  if (!host._adjacencyCache) {
    return host._buildAdjacency(state);
  }
  const cached = host._adjacencyCache.get(stateHash);
  if (cached) { return cached; }
  const adj = host._buildAdjacency(state);
  host._adjacencyCache.set(stateHash, adj);
  return adj;
}

function buildView(host: MaterializeHost, state: WarpState, stateHash: string, diff?: PatchDiff): void {
  if (host._cachedViewHash === stateHash) { return; }
  try {
    const result = buildOrApplyDiff(host, state, diff);
    applyViewResult(host, result, stateHash);
  } catch (err) {
    handleViewBuildFailure(host, err);
  }
}

type ViewResult = { logicalIndex: MaterializeHost['_logicalIndex']; propertyReader: MaterializeHost['_propertyReader']; tree: MaterializeHost['_cachedIndexTree'] };

function buildOrApplyDiff(host: MaterializeHost, state: WarpState, diff?: PatchDiff): ViewResult {
  if (diff && host._cachedIndexTree) {
    return host._viewService.applyDiff({ existingTree: host._cachedIndexTree, diff, state });
  }
  return host._viewService.build(state);
}

function applyViewResult(host: MaterializeHost, result: ViewResult, stateHash: string): void {
  host._logicalIndex = result.logicalIndex;
  host._propertyReader = result.propertyReader;
  host._cachedViewHash = stateHash;
  host._cachedIndexTree = result.tree;
  host._indexDegraded = false;
  if (host._materializedGraph) {
    host._materializedGraph.provider = new BitmapNeighborProvider({ logicalIndex: result.logicalIndex });
  }
}

function handleViewBuildFailure(host: MaterializeHost, err: unknown): void {
  host._logger?.warn('[warp] index build failed, falling back to linear scan', {
    error: (err instanceof Error) ? err.message : String(err),
  });
  host._indexDegraded = true;
  host._logicalIndex = null;
  host._propertyReader = null;
  host._cachedIndexTree = null;
}

// ── Auto-checkpoint + subscriber notification ───────────────────────

async function maybeAutoCheckpoint(host: MaterializeHost, patchCount: number): Promise<void> {
  if (!host._checkpointPolicy || host._checkpointing) { return; }
  if (patchCount < host._checkpointPolicy.every) { return; }
  try {
    await host.createCheckpoint();
    host._patchesSinceCheckpoint = 0;
  } catch { /* non-fatal */ }
}

function notifyIfChanged(host: MaterializeHost, state: WarpState): void {
  if (host._subscribers.length > 0) {
    const hasPendingReplay = host._subscribers.some((s: { pendingReplay?: boolean }) => s.pendingReplay === true);
    const delta = diffStates(host._lastNotifiedState, state);
    if (!isEmptyDiff(delta) || hasPendingReplay) {
      host._notifySubscribers(delta, state);
    }
  }
  host._lastNotifiedState = cloneState(state);
}

// ── Controller class ────────────────────────────────────────────────

export default class MaterializeController {
  _host: MaterializeHost;

  constructor(hostGraph: MaterializeHost) {
    this._host = hostGraph;
  }
}

// ── Wire methods ────────────────────────────────────────────────────

function wire(name: string, fn: Function): void {
  Object.defineProperty(MaterializeController.prototype, name, {
    value: fn, writable: true, configurable: true, enumerable: false,
  });
}

function host(ctrl: { _host: MaterializeHost }): MaterializeHost { return ctrl._host; }

// ── materialize ─────────────────────────────────────────────────────

function resolveCeiling(h: MaterializeHost, options?: { ceiling?: number | null }): number | null {
  if (options && 'ceiling' in options) { return options.ceiling ?? null; }
  return h._seekCeiling;
}

wire('_resolveCeiling', function (this: MaterializeController, options?: { ceiling?: number | null }): number | null {
  return resolveCeiling(this._host, options);
});

wire('materialize', async function (this: MaterializeController, options?: { receipts?: boolean; ceiling?: number | null }) {
  const h = this._host;
  const t0 = h._clock.now();
  const collectReceipts = options?.receipts === true;
  const ceiling = resolveCeiling(h, options);
  try {
    if (ceiling !== null) {
      return await materializeWithCeiling(h, this, { ceiling, collectReceipts, t0 });
    }
    return await materializeLive(h, this, { collectReceipts, t0 });
  } catch (err) {
    h._logTiming('materialize', t0, { error: err instanceof Error ? err : undefined });
    throw err;
  }
});

async function materializeLive(h: MaterializeHost, ctrl: MaterializeController, params: { collectReceipts: boolean; t0: number }): Promise<WarpState | { state: WarpState; receipts: TickReceipt[] }> {
  const checkpoint = await h._loadLatestCheckpoint();
  const wantDiff = !params.collectReceipts && h._cachedIndexTree !== null && h._cachedIndexTree !== undefined;

  const result = isV5CheckpointSchema(checkpoint?.schema)
    ? await materializeFromCheckpoint(h, checkpoint, { receipts: params.collectReceipts, wantDiff })
    : await materializeFromScratch(h, { receipts: params.collectReceipts, wantDiff });

  return await finalizeLive(h, ctrl, result, params);
}

type MaterializeResult = { state: WarpState; receipts?: TickReceipt[]; diff?: PatchDiff; patchCount: number; provenanceIndex: ProvenanceIndex };

async function materializeFromCheckpoint(h: MaterializeHost, checkpoint: NonNullable<Awaited<ReturnType<MaterializeHost['_loadLatestCheckpoint']>>>, params: { collectReceipts: boolean; wantDiff: boolean }): Promise<MaterializeResult> {
  const patches = await h._loadPatchesSince(checkpoint);
  if (checkpoint.frontier instanceof Map) {
    await scanFrontierLamport(h, checkpoint.frontier);
  }
  updateMaxLamport(h, patches);
  const reduced = reducePatches(patches, checkpoint.state, params);
  const ckPI = (checkpoint as { provenanceIndex?: ProvenanceIndex }).provenanceIndex;
  return {
    state: reduced.state,
    receipts: reduced.receipts,
    diff: reduced.diff,
    patchCount: patches.length,
    provenanceIndex: buildProvenanceFromPatches(patches, ckPI ?? undefined),
  };
}

async function materializeFromScratch(h: MaterializeHost, params: { collectReceipts: boolean; wantDiff: boolean }): Promise<MaterializeResult> {
  const writerIds = await h.discoverWriters();
  if (writerIds.length === 0) {
    return emptyResult(params.collectReceipts);
  }
  const allPatches = await loadAllWriterPatches(h, writerIds);
  if (allPatches.length === 0) {
    return emptyResult(params.collectReceipts);
  }
  updateMaxLamport(h, allPatches);
  const reduced = reducePatches(allPatches, undefined, params);
  return {
    state: reduced.state,
    receipts: reduced.receipts,
    diff: reduced.diff,
    patchCount: allPatches.length,
    provenanceIndex: buildProvenanceFromPatches(allPatches),
  };
}

function emptyResult(collectReceipts: boolean): MaterializeResult {
  return {
    state: createEmptyState(),
    receipts: collectReceipts ? [] : undefined,
    patchCount: 0,
    provenanceIndex: new ProvenanceIndex(),
  };
}

async function loadAllWriterPatches(h: MaterializeHost, writerIds: string[]): Promise<PatchEntry[]> {
  const all: PatchEntry[] = [];
  for (const writerId of writerIds) {
    const patches = await h._loadWriterPatches(writerId);
    for (const p of patches) { all.push(p); }
  }
  return all;
}

async function finalizeLive(h: MaterializeHost, ctrl: MaterializeController, result: MaterializeResult, params: { collectReceipts: boolean; t0: number }): Promise<WarpState | { state: WarpState; receipts: TickReceipt[] }> {
  await setMaterializedState(h, ctrl, result.state, result.diff);
  h._provenanceIndex = result.provenanceIndex;
  h._provenanceDegraded = false;
  h._cachedCeiling = null;
  h._cachedFrontier = null;
  h._lastFrontier = await h.getFrontier();
  h._patchesSinceCheckpoint = result.patchCount;

  await maybeAutoCheckpoint(h, result.patchCount);
  h._maybeRunGC(result.state);
  notifyIfChanged(h, result.state);

  h._logTiming('materialize', params.t0, { metrics: `${result.patchCount} patches` });
  if (params.collectReceipts) {
    return freezeWithReceipts(result.state, result.receipts ?? []);
  }
  return freezePublicState(result.state);
}

// ── materializeWithCeiling + coordinate ─────────────────────────────

async function materializeWithCeiling(h: MaterializeHost, ctrl: MaterializeController, params: { ceiling: number; collectReceipts: boolean; t0: number }): Promise<WarpState | { state: WarpState; receipts: TickReceipt[] }> {
  const frontier = await h.getFrontier();
  return await materializeWithCoordinate(h, ctrl, { frontier, ceiling: params.ceiling, collectReceipts: params.collectReceipts, t0: params.t0 });
}

type CoordinateParams = { frontier: Map<string, string>; ceiling: number | null; collectReceipts: boolean; t0: number };

async function materializeWithCoordinate(h: MaterializeHost, ctrl: MaterializeController, params: CoordinateParams): Promise<WarpState | { state: WarpState; receipts: TickReceipt[] }> {
  const cached = checkCoordinateCache(h, params);
  if (cached) { return cached; }
  if (isEmptyCoordinate(params)) {
    return await materializeEmptyCoordinate(h, ctrl, params);
  }
  return await materializeFullCoordinate(h, ctrl, params);
}

function checkCoordinateCache(h: MaterializeHost, params: CoordinateParams): WarpState | null {
  if (h._cachedState && !h._stateDirty && params.ceiling === h._cachedCeiling && !params.collectReceipts && frontiersEqual(h._cachedFrontier, params.frontier)) {
    return freezePublicState(h._cachedState);
  }
  return null;
}

function isEmptyCoordinate(params: CoordinateParams): boolean {
  return params.frontier.size === 0 || (params.ceiling !== null && params.ceiling <= 0);
}

async function materializeEmptyCoordinate(h: MaterializeHost, ctrl: MaterializeController, params: CoordinateParams): Promise<WarpState | { state: WarpState; receipts: TickReceipt[] }> {
  const state = createEmptyState();
  h._provenanceIndex = new ProvenanceIndex();
  h._provenanceDegraded = false;
  await setMaterializedState(h, ctrl, state);
  h._cachedCeiling = params.ceiling;
  h._cachedFrontier = new Map(params.frontier);
  h._logTiming('materialize', params.t0, { metrics: '0 patches (coordinate)' });
  if (params.collectReceipts) { return freezeWithReceipts(state, []); }
  return freezePublicState(state);
}

async function materializeFullCoordinate(h: MaterializeHost, ctrl: MaterializeController, params: CoordinateParams): Promise<WarpState | { state: WarpState; receipts: TickReceipt[] }> {
  let cacheKey: string | null = null;
  if (!params.collectReceipts) {
    const lookupResult = await tryReadCoordinateCache(h, { frontier: params.frontier, ceiling: params.ceiling, t0: params.t0 });
    if (lookupResult?.state) { return freezePublicState(lookupResult.state); }
    cacheKey = lookupResult?.cacheKey ?? null;
  }

  const allPatches = await collectPatchesForFrontier(h, { frontier: params.frontier, ceiling: params.ceiling });
  const reduced = reduceOrEmpty(allPatches, params.collectReceipts);

  h._provenanceIndex = buildProvenanceFromPatches(allPatches);
  h._provenanceDegraded = false;
  await setMaterializedState(h, ctrl, reduced.state);
  h._cachedCeiling = params.ceiling;
  h._cachedFrontier = new Map(params.frontier);

  await maybePersistCoordinateCache(h, { cacheKey, state: reduced.state, ceiling: params.ceiling, collectReceipts: params.collectReceipts, patchCount: allPatches.length, frontier: params.frontier });

  const label = params.ceiling === null ? 'latest' : String(params.ceiling);
  h._logTiming('materialize', params.t0, { metrics: `${allPatches.length} patches (coordinate ceiling=${label})` });

  if (params.collectReceipts) { return freezeWithReceipts(reduced.state, reduced.receipts ?? []); }
  return freezePublicState(reduced.state);
}

function reduceOrEmpty(patches: PatchEntry[], collectReceipts: boolean): ReduceResult {
  if (patches.length === 0) {
    return { state: createEmptyState(), receipts: collectReceipts ? [] : undefined };
  }
  return reducePatches(patches, undefined, { receipts: collectReceipts, wantDiff: false });
}

async function maybePersistCoordinateCache(h: MaterializeHost, params: { cacheKey: string | null; state: WarpState; ceiling: number | null; collectReceipts: boolean; patchCount: number; frontier: Map<string, string> }): Promise<void> {
  if (!h._seekCache || params.collectReceipts || params.patchCount === 0 || params.ceiling === null) { return; }
  try {
    const key = params.cacheKey ?? await buildSeekCacheKey(params.ceiling, params.frontier);
    persistSeekCacheEntry(h, { cacheKey: key, state: params.state }).catch(() => {});
  } catch { /* crypto unavailable */ }
}

// ── materializeCoordinate ───────────────────────────────────────────

wire('materializeCoordinate', async function (options: { frontier: Map<string, string> | Record<string, string>; ceiling?: number | null; receipts?: boolean }) {
  const h = host(this);
  if (options === null || options === undefined || typeof options !== 'object') {
    throw new QueryError('materializeCoordinate() requires an options object', { code: 'E_QUERY_COORDINATE_INVALID' });
  }
  const frontier = normalizeFrontierInput(options.frontier);
  const ceiling = normalizeExplicitCeiling(options.ceiling ?? null);
  const detached = await openDetachedGraph(h as WarpRuntime);
  const detachedCtrl = new MaterializeController(detached as WarpGraphWithMixins);
  return await materializeWithCoordinate(detached as WarpGraphWithMixins, detachedCtrl, {
    frontier, ceiling, collectReceipts: options.receipts === true, t0: (detached as WarpGraphWithMixins)._clock.now(),
  });
});

// ── materializeAt ───────────────────────────────────────────────────

wire('materializeAt', async function (checkpointSha: string) {
  const h = host(this);
  const targetFrontier = await buildTargetFrontier(h);
  const patchLoader = async (_writerId: string, fromSha: string | null, toSha: string) => {
    return await h._loadPatchChainFromSha(toSha, fromSha);
  };
  const persistence = h._persistence as CorePersistence;
  const state = await materializeIncremental({
    persistence, graphName: h._graphName, checkpointSha, targetFrontier, patchLoader, codec: h._codec,
  });
  await setMaterializedState(h, this, state);
  return freezePublicState(state);
});

async function buildTargetFrontier(h: MaterializeHost): Promise<Map<string, string>> {
  const writerIds = await h.discoverWriters();
  const frontier = createFrontier();
  for (const writerId of writerIds) {
    const ref = buildWriterRef(h._graphName, writerId);
    const tipSha = await h._persistence.readRef(ref);
    if (typeof tipSha === 'string' && tipSha.length > 0) {
      updateFrontier(frontier, writerId, tipSha);
    }
  }
  return frontier;
}

// ── _materializeGraph ───────────────────────────────────────────────

wire('_materializeGraph', async function (this: MaterializeController) {
  const h = this._host;
  if (!h._stateDirty && h._materializedGraph) {
    return h._materializedGraph;
  }
  const materialized = await h.materialize();
  const state = h._stateDirty
    ? (materialized as WarpState)
    : (h._cachedState ?? materialized as WarpState);
  if (state === undefined || state === null) {
    return h._materializedGraph;
  }
  if (!h._materializedGraph || h._materializedGraph.state !== state) {
    await setMaterializedState(h, this, state as WarpState);
  }
  return h._materializedGraph;
});

// ── _setMaterializedState ───────────────────────────────────────────

wire('_setMaterializedState', async function (state: WarpState, optionsOrDiff?: PatchDiff | { diff?: PatchDiff | null }) {
  let diff: PatchDiff | undefined;
  if (optionsOrDiff && typeof optionsOrDiff === 'object' && Object.prototype.hasOwnProperty.call(optionsOrDiff, 'diff')) {
    diff = (optionsOrDiff as { diff?: PatchDiff | null }).diff ?? undefined;
  } else {
    diff = optionsOrDiff as PatchDiff | undefined;
  }
  await setMaterializedState(host(this), this, state, diff);
  return host(this)._materializedGraph;
});

// ── _buildAdjacency + _buildView (delegated from host) ──────────────

wire('_buildAdjacency', function (state: WarpState) {
  return buildAdjacency(state);
});

wire('_buildView', function (state: WarpState, stateHash: string, diff?: PatchDiff) {
  buildView(host(this), state, stateHash, diff);
});

wire('_restoreIndexFromCache', async function (indexTreeOid: string) {
  await restoreIndexFromCache(host(this), indexTreeOid);
});

wire('_persistSeekCacheEntry', async function (cacheKey: string, _buf: Uint8Array, state: WarpState) {
  await persistSeekCacheEntry(host(this), { cacheKey, state });
});

// ── verifyIndex + invalidateIndex ───────────────────────────────────

wire('verifyIndex', function (options?: { seed?: number; sampleRate?: number }) {
  const h = host(this);
  if (!h._logicalIndex || !h._cachedState || !h._viewService) {
    throw new QueryError('Cannot verify index: graph not materialized or index not built', { code: 'E_QUERY_NO_STATE' });
  }
  return h._viewService.verifyIndex({
    state: h._cachedState,
    logicalIndex: h._logicalIndex,
    ...(options !== undefined ? { options } : {}),
  });
});

wire('invalidateIndex', function () {
  const h = host(this);
  h._cachedIndexTree = null;
  h._cachedViewHash = null;
});
