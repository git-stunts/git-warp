/**
 * ConflictAnalyzerService — read-only conflict provenance analysis over patch history.
 *
 * Orchestrates the pipeline: ConflictFrameLoader → ConflictCandidateCollector →
 * ConflictTraceAssembler → ConflictAnalysis.
 *
 * @module domain/services/strand/ConflictAnalyzerService
 */

import { canonicalStringify } from '../../utils/canonicalStringify.ts';
import ConflictAnalysis from '../../types/conflict/ConflictAnalysis.ts';
import type { HashablePayload } from '../../types/conflict/HashablePayload.ts';
import ConflictAnalysisRequest, { type ConflictAnalyzeOptions } from './ConflictAnalysisRequest.ts';
import {
  resolveAnalysisContext,
  attachReceipts,
  ScanWindow,
  CONFLICT_ANALYSIS_VERSION,
  type AnalyzerService,
} from './ConflictFrameLoader.ts';
import { ConflictCandidateCollector } from './ConflictCandidateCollector.ts';
import {
  groupCandidates,
  buildConflictTraces,
  filterTraces,
  buildAnalysisSnapshotHash,
  buildEmptySnapshotHash,
} from './ConflictTraceAssembler.ts';
import type ConflictDiagnostic from '../../types/conflict/ConflictDiagnostic.ts';
import type ConflictResolvedCoordinate from '../../types/conflict/ConflictResolvedCoordinate.ts';

export { CONFLICT_ANALYSIS_VERSION };

/**
 * ConflictAnalyzerService analyzes read-only patch history for conflict traces.
 */
export class ConflictAnalyzerService {
  /** @internal structural seam used by ConflictFrameLoader's strand-coordinator bridge. */
  readonly _graph: AnalyzerService['_graph'];
  private readonly _digestCache: Map<string, string>;

  /**
   * Initializes the analyzer with a warp runtime graph instance.
   */
  constructor({ graph }: { graph: AnalyzerService['_graph'] }) {
    this._graph = graph;
    this._digestCache = new Map();
  }

  /**
   * Computes a cached SHA-256 digest of the canonical serialization
   * of a hashable payload.
   */
  async _hash(payload: HashablePayload): Promise<string> {
    const canonical = canonicalStringify(payload);
    if (this._digestCache.has(canonical)) {
      return this._digestCache.get(canonical)!;
    }
    const digest = await this._graph._crypto.hash('sha256', canonical);
    this._digestCache.set(canonical, digest);
    return digest;
  }

  /**
   * Performs a full conflict analysis over the patch history.
   */
  async analyze(options?: ConflictAnalyzeOptions): Promise<ConflictAnalysis> {
    const request = ConflictAnalysisRequest.from(options);
    const diagnostics: ConflictDiagnostic[] = [];
    // `this` structurally satisfies AnalyzerService: carries _graph
    // (WarpRuntime ⊇ StrandCoordinatorGraphRuntime & _loadWriterPatches)
    // and _hash(payload: HashablePayload).
    const { patchFrames, resolvedCoordinate } = await resolveAnalysisContext(this, request);
    if (patchFrames.length === 0) {
      return await this._emptyResult(resolvedCoordinate, request, diagnostics);
    }
    attachReceipts(patchFrames);
    const scanWindow = new ScanWindow({
      patchFrames, maxPatches: request.maxPatches, lamportCeiling: request.lamportCeiling, diagnostics,
    });
    const collector = await ConflictCandidateCollector.collect(this, {
      patchFrames, scannedPatchShas: scanWindow.scannedPatchShas, diagnostics,
    });
    const traces = await buildConflictTraces(this, {
      grouped: groupCandidates(collector.candidates).values(), evidence: request.evidence, resolvedCoordinate,
    });
    const conflicts = filterTraces(traces, request);
    const analysisSnapshotHash = await buildAnalysisSnapshotHash(this, {
      resolvedCoordinate, request, truncated: scanWindow.truncated, diagnostics, traces: conflicts,
    });
    return new ConflictAnalysis({
      analysisVersion: CONFLICT_ANALYSIS_VERSION, resolvedCoordinate,
      analysisSnapshotHash, diagnostics, conflicts,
    });
  }

  private async _emptyResult(
    resolvedCoordinate: ConflictResolvedCoordinate,
    request: ConflictAnalysisRequest,
    diagnostics: ConflictDiagnostic[],
  ): Promise<ConflictAnalysis> {
    return new ConflictAnalysis({
      analysisVersion: CONFLICT_ANALYSIS_VERSION, resolvedCoordinate,
      analysisSnapshotHash: await buildEmptySnapshotHash(this, { resolvedCoordinate, request }),
      diagnostics, conflicts: [],
    });
  }
}

export default ConflictAnalyzerService;
