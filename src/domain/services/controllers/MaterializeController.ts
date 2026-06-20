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

import { reducePatches as reduceJoinedPatches, createEmptyState } from '../JoinReducer.ts';
import { type LoadPersistence } from '../state/checkpointLoad.ts';
import { ProvenanceIndex } from '../provenance/ProvenanceIndex.ts';
import { computeStateHash } from '../state/StateSerializer.ts';
import {
  normalizeFrontierInput,
  normalizeExplicitCeiling,
  buildAdjacency,
  maxLamportInPatches,
  type MaterializeAdjacency,
} from './MaterializeHelpers.ts';
import {
  reduceSessionBackedState,
  type MaterializeSessionOpener,
} from './MaterializeSessionBridge.ts';
import MaterializeLiveStrategy from './MaterializeLiveStrategy.ts';
import MaterializeCoordinateStrategy from './MaterializeCoordinateStrategy.ts';
import MaterializeCeilingStrategy from './MaterializeCeilingStrategy.ts';
import MaterializeCheckpointStrategy from './MaterializeCheckpointStrategy.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import type WarpStateCachePort from '../../../ports/WarpStateCachePort.ts';
import type PatchCollector from '../../capabilities/PatchCollector.ts';
import type { PatchWithSha } from '../../capabilities/PatchCollector.ts';
import type DetachedGraphFactory from '../../capabilities/DetachedGraphFactory.ts';
import type WarpState from '../state/WarpState.ts';
import type { TickReceipt } from '../../types/TickReceipt.ts';
import type { PatchDiff } from '../../types/PatchDiff.ts';
import AdjacencyMap from '../../capabilities/AdjacencyMap.ts';
import type {
  MaterializeResultBuildInput,
  MaterializeStrategyRuntime,
} from './MaterializeStrategyRuntime.ts';

export type MaterializePersistence = {
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

type ReducerInput = Parameters<typeof reduceJoinedPatches>[0];

function toReducerInput(patches: PatchWithSha[]): ReducerInput {
  return patches as ReducerInput;
}

export type MaterializeReduceOutput = {
  state: WarpState;
  adjacency?: MaterializeAdjacency;
  receipts?: TickReceipt[];
  diff?: PatchDiff;
};

function reduceWithReceipts(patches: PatchWithSha[], base?: WarpState): MaterializeReduceOutput {
  const r = reduceJoinedPatches(
    toReducerInput(patches),
    base,
    { receipts: true },
  ) as { state: WarpState; receipts: TickReceipt[] };
  return { state: r.state, receipts: r.receipts };
}

function reduceWithDiff(patches: PatchWithSha[], base?: WarpState): MaterializeReduceOutput {
  const r = reduceJoinedPatches(
    toReducerInput(patches),
    base,
    { trackDiff: true },
  ) as { state: WarpState; diff: PatchDiff };
  return { state: r.state, diff: r.diff };
}

function reducePlain(patches: PatchWithSha[], base?: WarpState): MaterializeReduceOutput {
  return { state: reduceJoinedPatches(toReducerInput(patches), base) };
}

function reduceMaterializePatches(
  patches: PatchWithSha[],
  base: WarpState | undefined,
  opts: { receipts: boolean; wantDiff: boolean },
): MaterializeReduceOutput {
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
  private readonly _liveStrategy: MaterializeLiveStrategy;
  private readonly _coordinateStrategy: MaterializeCoordinateStrategy;
  private readonly _ceilingStrategy: MaterializeCeilingStrategy;
  private readonly _checkpointStrategy: MaterializeCheckpointStrategy;

  constructor(deps: MaterializeDeps) {
    this._deps = deps;
    const runtime = this._createStrategyRuntime();
    this._liveStrategy = new MaterializeLiveStrategy(runtime);
    this._coordinateStrategy = new MaterializeCoordinateStrategy(runtime);
    this._ceilingStrategy = new MaterializeCeilingStrategy(runtime, this._coordinateStrategy);
    this._checkpointStrategy = new MaterializeCheckpointStrategy(runtime);
  }

  /** Full materialization — live frontier, optional ceiling. */
  async materialize(
    opts: { receipts?: boolean; ceiling?: number | null; wantDiff?: boolean } = {},
  ): Promise<MaterializeResult> {
    const ceiling = normalizeExplicitCeiling(opts.ceiling);
    if (ceiling !== null) {
      return await this._ceilingStrategy.materialize({ ceiling, receipts: opts.receipts === true });
    }
    return await this._liveStrategy.materialize({
      receipts: opts.receipts === true,
      wantDiff: opts.wantDiff === true,
    });
  }

  /** Coordinate materialization — explicit frontier. */
  async materializeCoordinate(
    opts: {
      frontier: Map<string, string> | Record<string, string>;
      ceiling?: number | null;
      receipts?: boolean;
    },
  ): Promise<MaterializeResult> {
    const frontier = normalizeFrontierInput(opts.frontier);
    const ceiling = normalizeExplicitCeiling(opts.ceiling);
    return await this._coordinateStrategy.materialize({ frontier, ceiling, receipts: opts.receipts === true });
  }

  /** Checkpoint materialization — replay from a specific checkpoint SHA. */
  async materializeAt(checkpointSha: string): Promise<MaterializeResult> {
    return await this._checkpointStrategy.materializeAt(checkpointSha);
  }

  private _assertLoadPersistence(
    persistence: MaterializePersistence,
  ): asserts persistence is MaterializePersistence & LoadPersistence {
    void persistence;
  }

  private _loadPersistence(): MaterializePersistence & LoadPersistence {
    const {persistence} = this._deps;
    this._assertLoadPersistence(persistence);
    return persistence;
  }

  // ── Result building ───────────────────────────────────────────────

  private async _emptyResult(
    ceiling?: number | null,
    frontier?: Map<string, string> | null,
  ): Promise<MaterializeResult> {
    return await this._wrapState(createEmptyState(), ceiling ?? null, frontier ?? null);
  }

  private async _wrapState(
    state: WarpState,
    ceiling: number | null,
    frontier: Map<string, string> | null,
  ): Promise<MaterializeResult> {
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

  private async _buildResult(params: MaterializeResultBuildInput): Promise<MaterializeResult> {
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
  ): Promise<MaterializeReduceOutput> {
    const {openStateSession} = this._deps;
    if (openStateSession === undefined) {
      return reduceMaterializePatches(patches, base, opts);
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

  private _createStrategyRuntime(): MaterializeStrategyRuntime {
    return {
      deps: this._deps,
      emptyResult: async (ceiling, frontier) => await this._emptyResult(ceiling, frontier),
      wrapState: async (state, ceiling, frontier) => await this._wrapState(state, ceiling, frontier),
      reducePatches: async (patches, base, opts) => await this._reducePatches(patches, base, opts),
      buildResult: async (params) => await this._buildResult(params),
      buildProvenance: (patches, base) => buildProvenance(patches, base),
      loadPersistence: () => this._loadPersistence(),
    };
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
