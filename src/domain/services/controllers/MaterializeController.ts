/**
 * MaterializeController — CRDT state replay from patches.
 *
 * Three materialization pipelines:
 * 1. materialize() — full or checkpoint-incremental, live frontier
 * 2. materializeCoordinate() — explicit frontier snapshot
 * 3. materializeAt() — specific checkpoint SHA
 *
 * Dependencies are constructor-injected. No host bag.
 * Side effects (notification, GC, auto-checkpoint) are the caller's job.
 */

import { reduceV5, createEmptyState } from '../JoinReducer.ts';
import { isV5CheckpointSchema } from '../state/checkpointHelpers.ts';
import { materializeIncremental, type LoadPersistence } from '../state/checkpointLoad.ts';
import { ProvenanceIndex } from '../provenance/ProvenanceIndex.ts';
import { computeStateHash } from '../state/StateSerializer.ts';
import { createFrontier, updateFrontier } from '../Frontier.ts';
import { buildWriterRef } from '../../utils/RefLayout.ts';
import {
  normalizeFrontierInput,
  normalizeExplicitCeiling,
  buildAdjacency,
  maxLamportInPatches,
  type MaterializeAdjacency,
} from './MaterializeHelpers.ts';
import SchemaUnsupportedError from '../../errors/SchemaUnsupportedError.ts';
import {
  reduceSessionBackedState,
  type MaterializeSessionOpener,
} from './MaterializeSessionBridge.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import type WarpStateCachePort from '../../../ports/WarpStateCachePort.ts';
import type {
  WarpStateCoordinate,
  WarpStateSnapshotRecord,
} from '../../../ports/WarpStateCachePort.ts';
import type PatchCollector from '../../capabilities/PatchCollector.ts';
import type { PatchWithSha, CheckpointData } from '../../capabilities/PatchCollector.ts';
import type DetachedGraphFactory from '../../capabilities/DetachedGraphFactory.ts';
import type WarpState from '../state/WarpState.ts';
import type { TickReceipt } from '../../types/TickReceipt.ts';
import type { PatchDiff } from '../../types/PatchDiff.ts';
import AdjacencyMap from '../../capabilities/AdjacencyMap.ts';

type MaterializePersistence = {
  readRef(ref: string): Promise<string | null>;
  showNode(sha: string): Promise<string>;
  readTreeOids(treeOid: string): Promise<Record<string, string>>;
  readBlob(oid: string): Promise<Uint8Array>;
};

// ── Deps ────────────────────────────────────────────────────────────

/** Constructor dependencies for MaterializeController. */
export type MaterializeDeps = {
  logger: LoggerPort;
  codec: CodecPort;
  crypto: CryptoPort;
  persistence: MaterializePersistence;
  getStateCache?: () => WarpStateCachePort | null;
  openStateSession?: MaterializeSessionOpener;
  patches: PatchCollector;
  graphCloner: DetachedGraphFactory;
  graphName: string;
};

// ── Result types ────────────────────────────────────────────────────

/** Full result of a materialization, returned to the caller. */
export type MaterializeResult = {
  state: WarpState;
  stateHash: string;
  adjacency: AdjacencyMap;
  receipts?: TickReceipt[] | undefined;
  diff?: PatchDiff | undefined;
  patchCount: number;
  maxObservedLamport: number;
  provenanceIndex: ProvenanceIndex;
  provenanceDegraded: boolean;
  frontier: Map<string, string> | null;
  ceiling: number | null;
};

// ── Reduce helpers ──────────────────────────────────────────────────

type ReducerInput = Parameters<typeof reduceV5>[0];

function toReducerInput(patches: PatchWithSha[]): ReducerInput {
  return patches as ReducerInput;
}

type ReduceOutput = {
  state: WarpState;
  adjacency?: MaterializeAdjacency;
  receipts?: TickReceipt[];
  diff?: PatchDiff;
};

function reduceWithReceipts(patches: PatchWithSha[], base?: WarpState): ReduceOutput {
  const r = reduceV5(toReducerInput(patches), base, { receipts: true }) as { state: WarpState; receipts: TickReceipt[] };
  return { state: r.state, receipts: r.receipts };
}

function reduceWithDiff(patches: PatchWithSha[], base?: WarpState): ReduceOutput {
  const r = reduceV5(toReducerInput(patches), base, { trackDiff: true }) as { state: WarpState; diff: PatchDiff };
  return { state: r.state, diff: r.diff };
}

function reducePlain(patches: PatchWithSha[], base?: WarpState): ReduceOutput {
  return { state: reduceV5(toReducerInput(patches), base) as WarpState };
}

function reducePatches(patches: PatchWithSha[], base: WarpState | undefined, opts: { receipts: boolean; wantDiff: boolean }): ReduceOutput {
  if (opts.receipts) { return reduceWithReceipts(patches, base); }
  if (opts.wantDiff) { return reduceWithDiff(patches, base); }
  return reducePlain(patches, base);
}

// ── Provenance ──────────────────────────────────────────────────────

function buildProvenance(patches: PatchWithSha[], base?: ProvenanceIndex): ProvenanceIndex {
  const index = base ? base.clone() : new ProvenanceIndex();
  for (const { patch, sha } of patches) {
    index.addPatch(sha, patch.reads, patch.writes);
  }
  return index;
}

// ── State hash ──────────────────────────────────────────────────────

async function computeHash(deps: MaterializeDeps, state: WarpState): Promise<string> {
  return await computeStateHash(state, { crypto: deps.crypto, codec: deps.codec });
}

// ── Controller ──────────────────────────────────────────────────────

export default class MaterializeController {
  private readonly _deps: MaterializeDeps;

  constructor(deps: MaterializeDeps) {
    this._deps = deps;
  }

  /** Full materialization — live frontier, optional ceiling. */
  async materialize(opts: { receipts?: boolean; ceiling?: number | null; wantDiff?: boolean }): Promise<MaterializeResult> {
    const ceiling = normalizeExplicitCeiling(opts.ceiling);
    if (ceiling !== null) {
      return await this._materializeWithCeiling({ ceiling, receipts: opts.receipts === true });
    }
    return await this._materializeLive({ receipts: opts.receipts === true, wantDiff: opts.wantDiff === true });
  }

  /** Coordinate materialization — explicit frontier. */
  async materializeCoordinate(opts: { frontier: Map<string, string> | Record<string, string>; ceiling?: number | null; receipts?: boolean }): Promise<MaterializeResult> {
    const frontier = normalizeFrontierInput(opts.frontier);
    const ceiling = normalizeExplicitCeiling(opts.ceiling);
    return await this._materializeCoordinate({ frontier, ceiling, receipts: opts.receipts === true });
  }

  /** Checkpoint materialization — replay from a specific checkpoint SHA. */
  async materializeAt(checkpointSha: string): Promise<MaterializeResult> {
    return await this._materializeAtCheckpoint(checkpointSha);
  }

  // ── Live pipeline ───────────────────────────────────────────────

  private async _materializeLive(opts: { receipts: boolean; wantDiff: boolean }): Promise<MaterializeResult> {
    const checkpoint = await this._deps.patches.loadCheckpoint();
    if (isV5CheckpointSchema(checkpoint?.schema)) {
      return await this._fromCheckpoint(checkpoint!, opts);
    }
    return await this._fromScratch(opts);
  }

  private async _fromCheckpoint(ck: CheckpointData, opts: { receipts: boolean; wantDiff: boolean }): Promise<MaterializeResult> {
    const patches = await this._deps.patches.loadPatchesSince(ck);
    const reduced = await this._reducePatches(patches, ck.state, opts);
    const provenance = buildProvenance(patches, ck.provenanceIndex as ProvenanceIndex | undefined);
    return await this._buildResult({ reduced, patches, provenance, degraded: false, ceiling: null, frontier: null });
  }

  private async _fromScratch(opts: { receipts: boolean; wantDiff: boolean }): Promise<MaterializeResult> {
    const writers = await this._deps.patches.discoverWriters();
    if (writers.length === 0) {
      return await this._emptyResult();
    }
    const patches = await this._loadAllPatches(writers);
    if (patches.length === 0) {
      return await this._emptyResult();
    }
    const reduced = await this._reducePatches(patches, undefined, opts);
    return await this._buildResult({ reduced, patches, provenance: buildProvenance(patches), degraded: false, ceiling: null, frontier: null });
  }

  private async _loadAllPatches(writers: string[]): Promise<PatchWithSha[]> {
    const all: PatchWithSha[] = [];
    for (const writerId of writers) {
      const patches = await this._deps.patches.loadWriterPatches(writerId);
      for (const p of patches) { all.push(p); }
    }
    return all;
  }

  // ── Ceiling + coordinate pipeline ─────────────────────────────────

  private async _materializeWithCeiling(opts: { ceiling: number; receipts: boolean }): Promise<MaterializeResult> {
    const frontier = await this._deps.patches.getFrontier();
    return await this._materializeCoordinate({ frontier, ceiling: opts.ceiling, receipts: opts.receipts });
  }

  private async _materializeCoordinate(opts: { frontier: Map<string, string>; ceiling: number | null; receipts: boolean }): Promise<MaterializeResult> {
    if (opts.frontier.size === 0 || (opts.ceiling !== null && opts.ceiling <= 0)) {
      return await this._emptyResult(opts.ceiling, opts.frontier);
    }
    const coordinate = this._snapshotCoordinate(opts.frontier, opts.ceiling);
    const cacheResolved = await this._tryResolveSnapshotCache({
      coordinate,
      receipts: opts.receipts,
    });
    if (cacheResolved !== null) {
      return cacheResolved;
    }
    const patches = await this._deps.patches.collectForFrontier(opts.frontier, opts.ceiling);
    if (patches.length === 0) {
      return await this._emptyResult(opts.ceiling, opts.frontier);
    }
    const reduced = await this._reducePatches(patches, undefined, {
      receipts: opts.receipts,
      wantDiff: false,
    });
    return await this._buildResult({ reduced, patches, provenance: buildProvenance(patches), degraded: false, ceiling: opts.ceiling, frontier: opts.frontier });
  }

  private _snapshotCoordinate(frontier: Map<string, string>, ceiling: number | null): WarpStateCoordinate {
    return {
      frontier,
      ceiling,
    };
  }

  private async _tryResolveSnapshotCache(opts: {
    coordinate: WarpStateCoordinate;
    receipts: boolean;
  }): Promise<MaterializeResult | null> {
    const stateCache = this._deps.getStateCache?.() ?? null;
    if (stateCache === null) {
      return null;
    }

    const exact = await stateCache.getExact(opts.coordinate);
    if (this._canUseSnapshot(exact, opts.receipts)) {
      return await this._snapshotToResult(exact!);
    }

    const predecessor = await stateCache.getBestCompatiblePredecessor(opts.coordinate);
    if (!this._canUseSnapshot(predecessor, opts.receipts)) {
      return null;
    }
    if (predecessor === null || predecessor.state === undefined) {
      return null;
    }

    const patches = await this._deps.patches.collectForFrontierSinceCoordinate(
      opts.coordinate.frontier,
      opts.coordinate.ceiling,
      predecessor.coordinate,
    );
    const reduced = await this._reducePatches(patches, predecessor.state, {
      receipts: false,
      wantDiff: false,
    });
    return await this._buildResult({
      reduced,
      patches,
      provenance: buildProvenance(patches),
      degraded: predecessor.provenancePosture === 'degraded',
      ceiling: opts.coordinate.ceiling,
      frontier: opts.coordinate.frontier,
    });
  }

  private _canUseSnapshot(
    snapshot: WarpStateSnapshotRecord | null,
    receipts: boolean,
  ): boolean {
    if (snapshot === null || snapshot.state === undefined) {
      return false;
    }
    if (receipts && snapshot.provenancePosture === 'degraded') {
      return false;
    }
    return true;
  }

  private async _snapshotToResult(snapshot: WarpStateSnapshotRecord): Promise<MaterializeResult> {
    return await this._buildResult({
      reduced: { state: snapshot.state! },
      patches: [],
      provenance: new ProvenanceIndex(),
      degraded: snapshot.provenancePosture === 'degraded',
      ceiling: snapshot.coordinate.ceiling,
      frontier: snapshot.coordinate.frontier,
    });
  }

  // ── Checkpoint SHA pipeline ───────────────────────────────────────

  private async _materializeAtCheckpoint(checkpointSha: string): Promise<MaterializeResult> {
    if (this._deps.openStateSession !== undefined) {
      throw new SchemaUnsupportedError(
        'materializeAt() is not supported on the session-backed runtime line. Run the offline checkpoint migration first.',
      );
    }
    const frontier = await this._buildTargetFrontier();
    const patchLoader = async (_w: string, from: string | null, to: string) =>
      await this._deps.patches.loadPatchChain(to, from);

    const state = await materializeIncremental({
      persistence: this._loadPersistence(),
      graphName: this._deps.graphName,
      checkpointSha,
      targetFrontier: frontier,
      patchLoader,
      codec: this._deps.codec,
    });
    return await this._wrapState(state, null, null);
  }

  private async _buildTargetFrontier(): Promise<Map<string, string>> {
    const writers = await this._deps.patches.discoverWriters();
    const frontier = createFrontier();
    for (const writerId of writers) {
      const ref = buildWriterRef(this._deps.graphName, writerId);
      const tipSha = await this._deps.persistence.readRef(ref);
      if (typeof tipSha === 'string' && tipSha.length > 0) {
        updateFrontier(frontier, writerId, tipSha);
      }
    }
    return frontier;
  }

  private _assertLoadPersistence(
    persistence: MaterializePersistence,
  ): asserts persistence is MaterializePersistence & LoadPersistence {
    void persistence;
  }

  private _loadPersistence(): MaterializePersistence & LoadPersistence {
    const persistence = this._deps.persistence;
    this._assertLoadPersistence(persistence);
    return persistence;
  }

  // ── Result building ───────────────────────────────────────────────

  private async _emptyResult(ceiling?: number | null, frontier?: Map<string, string> | null): Promise<MaterializeResult> {
    return await this._wrapState(createEmptyState(), ceiling ?? null, frontier ?? null);
  }

  private async _wrapState(state: WarpState, ceiling: number | null, frontier: Map<string, string> | null): Promise<MaterializeResult> {
    const stateHash = await computeHash(this._deps, state);
    const adjacency = buildAdjacency(state);
    await this._publishSnapshot({
      state,
      stateHash,
      degraded: false,
      ceiling,
      frontier,
    });
    return {
      state,
      stateHash,
      adjacency: new AdjacencyMap({ outgoing: adjacency.outgoing, incoming: adjacency.incoming }),
      patchCount: 0,
      maxObservedLamport: 0,
      provenanceIndex: new ProvenanceIndex(),
      provenanceDegraded: false,
      frontier,
      ceiling,
    };
  }

  private async _buildResult(params: {
    reduced: ReduceOutput;
    patches: PatchWithSha[];
    provenance: ProvenanceIndex;
    degraded: boolean;
    ceiling: number | null;
    frontier: Map<string, string> | null;
  }): Promise<MaterializeResult> {
    const stateHash = await computeHash(this._deps, params.reduced.state);
    const adjacency = params.reduced.adjacency ?? buildAdjacency(params.reduced.state);
    await this._publishSnapshot({
      state: params.reduced.state,
      stateHash,
      degraded: params.degraded,
      ceiling: params.ceiling,
      frontier: params.frontier,
    });
    return {
      state: params.reduced.state,
      stateHash,
      adjacency: new AdjacencyMap({ outgoing: adjacency.outgoing, incoming: adjacency.incoming }),
      receipts: params.reduced.receipts,
      diff: params.reduced.diff,
      patchCount: params.patches.length,
      maxObservedLamport: maxLamportInPatches(params.patches),
      provenanceIndex: params.provenance,
      provenanceDegraded: params.degraded,
      frontier: params.frontier,
      ceiling: params.ceiling,
    };
  }

  private async _reducePatches(
    patches: PatchWithSha[],
    base: WarpState | undefined,
    opts: { receipts: boolean; wantDiff: boolean },
  ): Promise<ReduceOutput> {
    const openStateSession = this._deps.openStateSession;
    if (openStateSession === undefined) {
      return reducePatches(patches, base, opts);
    }
    const sessionArgs = {
      openStateSession,
      patches,
      receipts: opts.receipts,
      wantDiff: opts.wantDiff,
      ...(base === undefined ? {} : { baseState: base }),
    };
    return await reduceSessionBackedState(sessionArgs);
  }

  private async _publishSnapshot(args: {
    state: WarpState;
    stateHash: string;
    degraded: boolean;
    ceiling: number | null;
    frontier: Map<string, string> | null;
  }): Promise<void> {
    const stateCache = this._deps.getStateCache?.() ?? null;
    if (stateCache === null || args.frontier === null) {
      return;
    }
    await stateCache.put({
      snapshotId: `snapshot:${args.stateHash}`,
      coordinate: {
        frontier: args.frontier,
        ceiling: args.ceiling,
      },
      retention: 'evictable',
      provenancePosture: args.degraded ? 'degraded' : 'full',
      stateHash: args.stateHash,
      payloadRef: `snapshot:${args.stateHash}`,
      createdAt: 'materialize-controller',
      state: args.state,
    });
  }
}
