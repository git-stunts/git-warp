/**
 * ConflictAnalyzerService — read-only conflict provenance analysis over patch history.
 *
 * Orchestrates the pipeline: ConflictFrameLoader → ConflictCandidateCollector →
 * ConflictTraceAssembler → ConflictAnalysis.
 *
 * @module domain/services/strand/ConflictAnalyzerService
 */

import ConflictAnalysis from '../../types/conflict/ConflictAnalysis.ts';
import ConflictAnalysisRequest, { type ConflictAnalyzeOptions } from './ConflictAnalysisRequest.ts';
import {
  resolveAnalysisContext,
  attachReceipts,
  ScanWindow,
  CONFLICT_ANALYSIS_VERSION,
} from './ConflictFrameLoader.ts';
import ConflictPipelineContext, { type ConflictPipelineGraphRuntime } from './ConflictPipelineContext.ts';
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
  private readonly _pipelineContext: ConflictPipelineContext;

  /**
   * Initializes the analyzer with a warp runtime graph instance.
   */
  constructor({ graph }: { graph: ConflictPipelineGraphRuntime }) {
    this._pipelineContext = new ConflictPipelineContext({ graph });
  }

  /**
   * Performs a full conflict analysis over the patch history.
   */
  async analyze(options?: ConflictAnalyzeOptions): Promise<ConflictAnalysis> {
    const request = ConflictAnalysisRequest.from(options);
    const diagnostics: ConflictDiagnostic[] = [];
    const context = this._pipelineContext;
    const { patchFrames, resolvedCoordinate } = await resolveAnalysisContext(context, request);
    if (patchFrames.length === 0) {
      return await this._emptyResult(resolvedCoordinate, request, diagnostics);
    }
    attachReceipts(patchFrames);
    const scanWindow = new ScanWindow({
      patchFrames, maxPatches: request.maxPatches, lamportCeiling: request.lamportCeiling, diagnostics,
    });
    const collector = await ConflictCandidateCollector.collect(context, {
      patchFrames, scannedPatchShas: scanWindow.scannedPatchShas, diagnostics,
    });
    const traces = await buildConflictTraces(context, {
      grouped: groupCandidates(collector.candidates).values(), evidence: request.evidence, resolvedCoordinate,
    });
    const conflicts = filterTraces(traces, request);
    const analysisSnapshotHash = await buildAnalysisSnapshotHash(context, {
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
    const context = this._pipelineContext;
    return new ConflictAnalysis({
      analysisVersion: CONFLICT_ANALYSIS_VERSION, resolvedCoordinate,
      analysisSnapshotHash: await buildEmptySnapshotHash(context, { resolvedCoordinate, request }),
      diagnostics, conflicts: [],
    });
  }
}

export default ConflictAnalyzerService;
