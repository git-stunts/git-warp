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
import { isV5CheckpointSchema, materializeIncremental } from '../state/CheckpointService.js';
import { ProvenanceIndex } from '../provenance/ProvenanceIndex.js';
import { computeStateHashV5 } from '../state/StateSerializerV5.js';
import { createFrontier, updateFrontier } from '../Frontier.js';
import { buildWriterRef } from '../../utils/RefLayout.ts';
import { normalizeFrontierInput, normalizeExplicitCeiling, buildAdjacency } from './MaterializeHelpers.ts';
import type ClockPort from '../../../ports/ClockPort.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import type SeekCachePort from '../../../ports/SeekCachePort.ts';
import type GraphPersistencePort from '../../../ports/GraphPersistencePort.ts';
import type PatchCollector from '../../capabilities/PatchCollector.ts';
import type { PatchWithSha, CheckpointData } from '../../capabilities/PatchCollector.ts';
import type DetachedGraphFactory from '../../capabilities/DetachedGraphFactory.ts';
import type WarpState from '../state/WarpState.ts';
import type { TickReceipt } from '../../types/TickReceipt.ts';
import type { PatchDiff } from '../../types/PatchDiff.ts';
import type { CorePersistence } from '../../types/WarpPersistence.ts';
import AdjacencyMap from '../../capabilities/AdjacencyMap.ts';

// ── Deps ────────────────────────────────────────────────────────────

/** Constructor dependencies for MaterializeController. */
export type MaterializeDeps = {
  clock: ClockPort;
  logger: LoggerPort;
  codec: CodecPort;
  crypto: CryptoPort;
  persistence: GraphPersistencePort;
  seekCache: SeekCachePort | null;
  patches: PatchCollector;
  graphCloner: DetachedGraphFactory;
  graphName: string;
  /** Called after every materialization. Host applies side effects here. */
  onMaterialized: (result: MaterializeResult) => Promise<void>;
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

type ReduceOutput = { state: WarpState; receipts?: TickReceipt[]; diff?: PatchDiff };

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
  const index = base ? (base.clone() as ProvenanceIndex) : new ProvenanceIndex();
  for (const { patch, sha } of patches) {
    index.addPatch(sha, patch.reads, patch.writes);
  }
  return index;
}

// ── State hash ──────────────────────────────────────────────────────

async function computeHash(deps: MaterializeDeps, state: WarpState): Promise<string> {
  return await computeStateHashV5(state, { crypto: deps.crypto, codec: deps.codec });
}

// ── Controller ──────────────────────────────────────────────────────

export default class MaterializeController {
  private readonly _deps: MaterializeDeps;

  constructor(deps: MaterializeDeps) {
    this._deps = deps;
  }

  /** Emits result to the host callback and returns it. */
  private async _emit(result: MaterializeResult): Promise<MaterializeResult> {
    await this._deps.onMaterialized(result);
    return result;
  }

  /** Full materialization — live frontier, optional ceiling. */
  async materialize(opts: { receipts?: boolean; ceiling?: number | null; wantDiff?: boolean }): Promise<MaterializeResult> {
    const ceiling = normalizeExplicitCeiling(opts.ceiling);
    if (ceiling !== null) {
      return await this._emit(await this._materializeWithCeiling({ ceiling, receipts: opts.receipts === true }));
    }
    return await this._emit(await this._materializeLive({ receipts: opts.receipts === true, wantDiff: opts.wantDiff === true }));
  }

  /** Coordinate materialization — explicit frontier. */
  async materializeCoordinate(opts: { frontier: Map<string, string> | Record<string, string>; ceiling?: number | null; receipts?: boolean }): Promise<MaterializeResult> {
    const frontier = normalizeFrontierInput(opts.frontier);
    const ceiling = normalizeExplicitCeiling(opts.ceiling);
    return await this._emit(await this._materializeCoordinate({ frontier, ceiling, receipts: opts.receipts === true }));
  }

  /** Checkpoint materialization — replay from a specific checkpoint SHA. */
  async materializeAt(checkpointSha: string): Promise<MaterializeResult> {
    return await this._emit(await this._materializeAtCheckpoint(checkpointSha));
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
    const reduced = reducePatches(patches, ck.state, opts);
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
    const reduced = reducePatches(patches, undefined, opts);
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
    const patches = await this._deps.patches.collectForFrontier(opts.frontier, opts.ceiling);
    if (patches.length === 0) {
      return await this._emptyResult(opts.ceiling, opts.frontier);
    }
    const reduced = reducePatches(patches, undefined, { receipts: opts.receipts, wantDiff: false });
    return await this._buildResult({ reduced, patches, provenance: buildProvenance(patches), degraded: false, ceiling: opts.ceiling, frontier: opts.frontier });
  }

  // ── Checkpoint SHA pipeline ───────────────────────────────────────

  private async _materializeAtCheckpoint(checkpointSha: string): Promise<MaterializeResult> {
    const frontier = await this._buildTargetFrontier();
    const patchLoader = async (_w: string, from: string | null, to: string) =>
      await this._deps.patches.loadPatchChain(to, from);

    const state = await materializeIncremental({
      persistence: this._deps.persistence as CorePersistence,
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

  // ── Result building ───────────────────────────────────────────────

  private async _emptyResult(ceiling?: number | null, frontier?: Map<string, string> | null): Promise<MaterializeResult> {
    return await this._wrapState(createEmptyState(), ceiling ?? null, frontier ?? null);
  }

  private async _wrapState(state: WarpState, ceiling: number | null, frontier: Map<string, string> | null): Promise<MaterializeResult> {
    const stateHash = await computeHash(this._deps, state);
    const adjacency = buildAdjacency(state);
    return {
      state,
      stateHash,
      adjacency: new AdjacencyMap({ outgoing: adjacency.outgoing, incoming: adjacency.incoming }),
      patchCount: 0,
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
    const adjacency = buildAdjacency(params.reduced.state);
    const AdjMap = (await import('../../capabilities/AdjacencyMap.ts')).default;
    return {
      state: params.reduced.state,
      stateHash,
      adjacency: new AdjMap({ outgoing: adjacency.outgoing, incoming: adjacency.incoming }),
      receipts: params.reduced.receipts,
      diff: params.reduced.diff,
      patchCount: params.patches.length,
      provenanceIndex: params.provenance,
      provenanceDegraded: params.degraded,
      frontier: params.frontier,
      ceiling: params.ceiling,
    };
  }
}
