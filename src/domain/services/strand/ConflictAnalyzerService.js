/**
 * ConflictAnalyzerService — read-only conflict provenance analysis over patch history.
 *
 * Orchestrates the pipeline: ConflictFrameLoader → ConflictCandidateCollector →
 * ConflictTraceAssembler → ConflictAnalysis.
 *
 * @module domain/services/strand/ConflictAnalyzerService
 */

import { canonicalStringify } from '../../utils/canonicalStringify.js';
import ConflictAnalysis from '../../types/conflict/ConflictAnalysis.ts';
import ConflictAnalysisRequest from './ConflictAnalysisRequest.js';
import {
  resolveAnalysisContext,
  attachReceipts,
  ScanWindow,
  CONFLICT_ANALYSIS_VERSION,
} from './ConflictFrameLoader.js';
import { ConflictCandidateCollector } from './ConflictCandidateCollector.js';
import {
  groupCandidates,
  buildConflictTraces,
  filterTraces,
  buildAnalysisSnapshotHash,
  buildEmptySnapshotHash,
} from './ConflictTraceAssembler.js';

export { CONFLICT_ANALYSIS_VERSION };

/**
 * ConflictAnalyzerService analyzes read-only patch history for conflict traces.
 */
export class ConflictAnalyzerService {
  /**
   * Initializes the analyzer with a warp runtime graph instance.
   *
   * @param {{ graph: import('../../WarpRuntime.js').default }} options - Construction options.
   */
  constructor({ graph }) {
    this._graph = graph;
    this._digestCache = new Map();
  }

  /**
   * Computes a cached SHA-256 digest of the canonical serialization of a payload.
   *
   * @param {unknown} payload - The value to hash.
   * @returns {Promise<string>} Hex-encoded digest.
   */
  async _hash(payload) {
    const canonical = canonicalStringify(payload);
    if (this._digestCache.has(canonical)) {
      return this._digestCache.get(canonical);
    }
    const digest = await this._graph._crypto.hash('sha256', canonical);
    this._digestCache.set(canonical, digest);
    return digest;
  }

  /**
   * Performs a full conflict analysis over the patch history.
   *
   * @param {import('./ConflictAnalysisRequest.js').ConflictAnalyzeOptions} [options] - Optional analysis filters and budget.
   * @returns {Promise<ConflictAnalysis>} The complete analysis result.
   */
  async analyze(options) {
    const request = ConflictAnalysisRequest.from(options);
    const diagnostics = [];
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

  /**
   * Builds an empty analysis result for the zero-patches case.
   *
   * @param {unknown} resolvedCoordinate - The resolved coordinate.
   * @param {ConflictAnalysisRequest} request - The normalized request.
   * @param {Array<unknown>} diagnostics - The diagnostics accumulator.
   * @returns {Promise<ConflictAnalysis>}
   */
  async _emptyResult(resolvedCoordinate, request, diagnostics) {
    return new ConflictAnalysis({
      analysisVersion: CONFLICT_ANALYSIS_VERSION, resolvedCoordinate,
      analysisSnapshotHash: await buildEmptySnapshotHash(this, { resolvedCoordinate, request }),
      diagnostics, conflicts: [],
    });
  }
}

export default ConflictAnalyzerService;
