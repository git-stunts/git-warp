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
import { ProvenanceIndex } from '../provenance/ProvenanceIndex.ts';
import { computeStateHash } from '../state/StateSerializer.ts';
import {
  normalizeFrontierInput,
  normalizeExplicitCeiling,
  buildAdjacency,
  maxObservedLamportInState,
  type MaterializeAdjacency,
} from './MaterializeHelpers.ts';
import {
  materializationSessionOpen,
  reduceSessionBackedState,
  type MaterializeSessionOpener,
} from './MaterializeSessionBridge.ts';
import MaterializeLiveStrategy from './MaterializeLiveStrategy.ts';
import MaterializeCoordinateStrategy from './MaterializeCoordinateStrategy.ts';
import MaterializeCeilingStrategy from './MaterializeCeilingStrategy.ts';
import MaterializeCheckpointStrategy from './MaterializeCheckpointStrategy.ts';
import MaterializePatchStreamReducer, {
  type MaterializePatchStreamOptions,
  type MaterializePatchStreamReduction,
} from './MaterializePatchStreamReducer.ts';
import { MaterializePatchSummaryAccumulator } from './MaterializePatchSummary.ts';
import {
  shouldPublishMaterializeSnapshot,
  type MaterializeSnapshotPublicationOptions,
} from './MaterializeSnapshotPublication.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import type CheckpointStorePort from '../../../ports/CheckpointStorePort.ts';
import type WarpStateCachePort from '../../../ports/WarpStateCachePort.ts';
import type MaterializationStorePort from '../../../ports/MaterializationStorePort.ts';
import type { WarpStateSnapshotProvenancePosture } from '../../../ports/WarpStateCachePort.ts';
import type PatchCollector from '../../capabilities/PatchCollector.ts';
import type { PatchWithSha } from '../../capabilities/PatchCollector.ts';
import type DetachedGraphFactory from '../../capabilities/DetachedGraphFactory.ts';
import PatchEntry from '../../artifacts/PatchEntry.ts';
import type WarpState from '../state/WarpState.ts';
import type { TickReceipt } from '../../types/TickReceipt.ts';
import type { PatchDiff } from '../../types/PatchDiff.ts';
import AdjacencyMap from '../../capabilities/AdjacencyMap.ts';
import MaterializationCoordinate from '../../materialization/MaterializationCoordinate.ts';
import type MaterializationHandle from '../../materialization/MaterializationHandle.ts';
import type MaterializationRoots from '../../materialization/MaterializationRoots.ts';
import WarpError from '../../errors/WarpError.ts';
import type { UsableSnapshotRecord } from './MaterializeSnapshotCacheResult.ts';
import type {
  MaterializeResultBuildInput,
  MaterializeStrategyRuntime,
} from './MaterializeStrategyRuntime.ts';

export type MaterializePersistence = {
  readRef(ref: string): Promise<string | null>;
};

// ── Deps ────────────────────────────────────────────────────────────

/** Constructor dependencies for MaterializeController. */
export type MaterializeDeps = {
  logger: LoggerPort;
  codec: CodecPort;
  crypto: CryptoPort;
  persistence: MaterializePersistence;
  checkpointStore: CheckpointStorePort;
  materializations: MaterializationStorePort;
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
  materialization?: MaterializationHandle;
};

// ── Reduce helpers ──────────────────────────────────────────────────

type ReducerInput = Parameters<typeof reduceJoinedPatches>[0];

function toReducerInput(patches: PatchWithSha[]): ReducerInput {
  return patches as ReducerInput;
}

export type MaterializeReduceOutput = {
  state: WarpState;
  adjacency?: MaterializeAdjacency;
  roots?: MaterializationRoots;
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

  // ── Result building ───────────────────────────────────────────────

  private async _emptyResult(
    ceiling?: number | null,
    frontier?: Map<string, string> | null,
    options?: MaterializeSnapshotPublicationOptions,
  ): Promise<MaterializeResult> {
    return await this._wrapState(
      createEmptyState(),
      ceiling ?? null,
      frontier ?? null,
      'full',
      options,
    );
  }

  private async _wrapState(
    state: WarpState,
    ceiling: number | null,
    frontier: Map<string, string> | null,
    provenance: WarpStateSnapshotProvenancePosture,
    options?: MaterializeSnapshotPublicationOptions,
  ): Promise<MaterializeResult> {
    const stateHash = await computeHash(this._deps, state);
    const adjacency = buildAdjacency(state);
    if (shouldPublishMaterializeSnapshot(options)) {
      await this._publishSnapshot({
        state,
        stateHash,
        ceiling,
        frontier,
      });
    }
    return {
      state,
      stateHash,
      adjacency: new AdjacencyMap({ outgoing: adjacency.outgoing, incoming: adjacency.incoming }),
      patchCount: 0,
      maxObservedLamport: maxObservedLamportInState(state),
      provenanceIndex: new ProvenanceIndex(),
      provenanceDegraded: provenance === 'degraded',
      frontier,
      ceiling,
    };
  }

  private async _buildResult(params: MaterializeResultBuildInput): Promise<MaterializeResult> {
    const stateHash = await computeHash(this._deps, params.reduced.state);
    const adjacency = params.reduced.adjacency ?? buildAdjacency(params.reduced.state);
    const materialization = await this._resolveMaterialization(params, stateHash);
    if (params.reduced.receipts === undefined && params.publishSnapshot !== false) {
      await this._publishSnapshot({
        state: params.reduced.state,
        stateHash,
        ceiling: params.ceiling,
        frontier: params.frontier,
      });
    }
    return {
      state: params.reduced.state,
      stateHash,
      adjacency: new AdjacencyMap({ outgoing: adjacency.outgoing, incoming: adjacency.incoming }),
      receipts: params.reduced.receipts,
      diff: params.reduced.diff,
      patchCount: params.summary.patchCount,
      maxObservedLamport: Math.max(
        params.summary.maxObservedLamport,
        maxObservedLamportInState(params.reduced.state),
      ),
      provenanceIndex: params.summary.provenance,
      provenanceDegraded: params.degraded,
      frontier: params.frontier,
      ceiling: params.ceiling,
      ...(materialization === undefined ? {} : { materialization }),
    };
  }

  private async _resolveMaterialization(
    params: MaterializeResultBuildInput,
    stateHash: string,
  ): Promise<MaterializationHandle | undefined> {
    if (params.materialization !== undefined) {
      if (params.materialization.stateHash !== stateHash) {
        throw materializationResumeError('retained handle state hash does not match resumed state');
      }
      return params.materialization;
    }
    if (params.reduced.roots === undefined || params.frontier === null) {
      return undefined;
    }
    return await this._deps.materializations.retain({
      coordinate: new MaterializationCoordinate({
        frontier: params.frontier,
        ceiling: params.ceiling,
      }),
      roots: params.reduced.roots,
      stateHash,
    });
  }

  private async _resumeExactMaterialization(
    snapshot: UsableSnapshotRecord,
    options: { wantDiff: boolean },
  ): Promise<MaterializeResult | null> {
    const { openStateSession } = this._deps;
    if (openStateSession === undefined) {
      return null;
    }
    const coordinate = new MaterializationCoordinate(snapshot.coordinate);
    const retained = await this._deps.materializations.findExact(coordinate);
    if (retained !== null && retained.stateHash !== snapshot.stateHash) {
      throw materializationResumeError('retained handle and snapshot state hashes differ');
    }
    const retainedRoots = retained === null
      ? null
      : materializationSessionOpen(retained.roots);
    const reduced = await reduceSessionBackedState({
      openStateSession,
      patches: [],
      baseState: snapshot.state,
      ...(retainedRoots === null ? {} : { roots: retainedRoots }),
      receipts: false,
      wantDiff: options.wantDiff,
    });
    return await this._buildResult({
      reduced,
      summary: new MaterializePatchSummaryAccumulator().toSummary(),
      degraded: true,
      ceiling: snapshot.coordinate.ceiling,
      frontier: snapshot.coordinate.frontier,
      publishSnapshot: false,
      ...(retained === null || retainedRoots === null
        ? {}
        : { materialization: retained }),
    });
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
      patches: patches.map((entry) => new PatchEntry(entry)),
      receipts: opts.receipts,
      wantDiff: opts.wantDiff,
      ...(base === undefined ? {} : { baseState: base }),
    };
    return await reduceSessionBackedState(sessionArgs);
  }

  private async _reducePatchStream(
    stream: AsyncIterable<PatchWithSha>,
    base: WarpState | undefined,
    opts: MaterializePatchStreamOptions,
    provenanceBase?: ProvenanceIndex,
  ): Promise<MaterializePatchStreamReduction> {
    if (this._deps.openStateSession === undefined) {
      return await MaterializePatchStreamReducer.reduce({
        source: stream,
        base,
        options: opts,
        ...(provenanceBase === undefined ? {} : { provenanceBase }),
      });
    }
    const summary = new MaterializePatchSummaryAccumulator(provenanceBase);
    const recordingStream = async function* (): AsyncIterable<PatchEntry> {
      for await (const entry of stream) {
        summary.record(entry);
        yield new PatchEntry(entry);
      }
    };
    const reduced = await reduceSessionBackedState({
      openStateSession: this._deps.openStateSession,
      patches: recordingStream(),
      receipts: opts.receipts,
      wantDiff: opts.wantDiff,
      ...(base === undefined ? {} : { baseState: base }),
    });
    return {
      reduced,
      summary: summary.toSummary(),
    };
  }

  private _createStrategyRuntime(): MaterializeStrategyRuntime {
    return {
      deps: this._deps,
      emptyResult: async (ceiling, frontier, options) =>
        await this._emptyResult(ceiling, frontier, options),
      wrapState: async (state, ceiling, frontier, provenance, options) =>
        await this._wrapState(state, ceiling, frontier, provenance, options),
      reducePatches: async (patches, base, opts) => await this._reducePatches(patches, base, opts),
      reducePatchStream: async (stream, base, opts, provenanceBase) =>
        await this._reducePatchStream(stream, base, opts, provenanceBase),
      buildResult: async (params) => await this._buildResult(params),
      resumeExactMaterialization: async (snapshot, options) =>
        await this._resumeExactMaterialization(snapshot, options),
      buildProvenance: (patches, base) => buildProvenance(patches, base),
    };
  }

  private async _publishSnapshot(args: {
    state: WarpState;
    stateHash: string;
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
      provenancePosture: 'degraded',
      stateHash: args.stateHash,
      payloadRef: `snapshot:${args.stateHash}`,
      createdAt: 'materialize-controller',
      state: args.state,
    });
  }
}

function materializationResumeError(message: string): WarpError {
  return new WarpError(
    `Materialization resume ${message}`,
    'E_MATERIALIZATION_RESUME',
  );
}
