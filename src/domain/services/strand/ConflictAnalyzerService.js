/**
 * ConflictAnalyzerService — read-only conflict provenance analysis over patch history.
 *
 * This service orchestrates the conflict analysis pipeline by delegating to
 * ConflictFrameLoader (context resolution), ConflictCandidateCollector
 * (record building + candidate classification), and ConflictTraceAssembler
 * (trace construction + filtering + snapshot hashing).
 *
 * @module domain/services/strand/ConflictAnalyzerService
 */

import { canonicalStringify } from '../../utils/canonicalStringify.js';
import ConflictAnalysis from '../../types/conflict/ConflictAnalysis.js';
import ConflictAnalysisRequest from './ConflictAnalysisRequest.js';
import {
  resolveAnalysisContext,
  attachReceipts,
  PatchFrame,
  ScanWindow,
  CONFLICT_ANALYSIS_VERSION,
  CONFLICT_TRAVERSAL_ORDER,
  CONFLICT_TRUNCATION_POLICY,
} from './ConflictFrameLoader.js';
import { ConflictCandidateCollector } from './ConflictCandidateCollector.js';
import {
  groupCandidates,
  buildConflictTraces,
  filterTraces,
  buildAnalysisSnapshotHash,
  buildEmptySnapshotHash,
} from './ConflictTraceAssembler.js';

/** @import ConflictResolvedCoordinate from '../../types/conflict/ConflictResolvedCoordinate.js' */
/** @import WarpRuntime from '../../WarpRuntime.js' */
/** @import { ConflictAnalyzeOptions } from './ConflictAnalysisRequest.js' */

export { CONFLICT_ANALYSIS_VERSION, CONFLICT_TRAVERSAL_ORDER, CONFLICT_TRUNCATION_POLICY, PatchFrame };
export const CONFLICT_REDUCER_ID = 'join-reducer-v5';

/**
 * Computes a SHA-256 digest of the canonical JSON serialization of a payload, with caching.
 *
 * @param {{
 *   digestCache: Map<string, string>,
 *   crypto: import('../../../ports/CryptoPort.js').default,
 *   payload: unknown
 * }} options - Cache, crypto port, and payload to hash.
 * @returns {Promise<string>} Hex-encoded SHA-256 digest.
 */
async function hashPayload({ digestCache, crypto, payload }) {
  const canonical = canonicalStringify(payload);
  if (digestCache.has(canonical)) {
    return /** @type {string} */ (digestCache.get(canonical));
  }
  const digest = await crypto.hash('sha256', canonical);
  digestCache.set(canonical, digest);
  return digest;
}

/**
 * Assembles the final ConflictAnalysis result.
 *
 * @param {{
 *   resolvedCoordinate: ConflictResolvedCoordinate,
 *   analysisSnapshotHash: string,
 *   diagnostics: ConflictDiagnostic[],
 *   conflicts: import('../../types/conflict/ConflictTrace.js').default[]
 * }} options - Result components.
 * @returns {ConflictAnalysis} The assembled analysis result.
 */
function buildConflictAnalysisResult({
  resolvedCoordinate,
  analysisSnapshotHash,
  diagnostics,
  conflicts,
}) {
  return new ConflictAnalysis({
    analysisVersion: CONFLICT_ANALYSIS_VERSION,
    resolvedCoordinate,
    analysisSnapshotHash,
    diagnostics,
    conflicts,
  });
}

/**
 * ConflictAnalyzerService analyzes read-only patch history for conflict traces.
 */
export class ConflictAnalyzerService {
  /**
   * Initializes the analyzer with a warp runtime graph instance.
   *
   * @param {{ graph: WarpRuntime }} options - Construction options with graph dependency.
   */
  constructor({ graph }) {
    this._graph = graph;
    /** @type {Map<string, string>} */
    this._digestCache = new Map();
  }

  /**
   * Computes a cached SHA-256 digest of the canonical serialization of a payload.
   *
   * @param {unknown} payload - The value to hash.
   * @returns {Promise<string>} Hex-encoded digest.
   */
  async _hash(payload) {
    return await hashPayload({
      digestCache: this._digestCache,
      crypto: this._graph._crypto,
      payload,
    });
  }

  /**
   * Performs a full conflict analysis over the patch history, returning all detected traces.
   *
   * @param {ConflictAnalyzeOptions} [options] - Optional analysis filters and budget.
   * @returns {Promise<ConflictAnalysis>} The complete analysis result.
   */
  async analyze(options) {
    const request = ConflictAnalysisRequest.from(options);
    const diagnostics = [];
    const { patchFrames, resolvedCoordinate } = await resolveAnalysisContext(this, request);
    if (patchFrames.length === 0) {
      return buildConflictAnalysisResult({
        resolvedCoordinate,
        analysisSnapshotHash: await buildEmptySnapshotHash(this, { resolvedCoordinate, request }),
        diagnostics,
        conflicts: [],
      });
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
    return buildConflictAnalysisResult({ resolvedCoordinate, analysisSnapshotHash, diagnostics, conflicts });
  }
}

export default ConflictAnalyzerService;
