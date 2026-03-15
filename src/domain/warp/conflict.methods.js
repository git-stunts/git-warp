/**
 * Conflict analysis methods for WarpGraph.
 *
 * @module domain/warp/conflict.methods
 */

import ConflictAnalyzerService from '../services/ConflictAnalyzerService.js';

/**
 * Analyze read-only conflict provenance over the current frontier with an
 * optional Lamport ceiling.
 *
 * This method performs zero durable writes. It does not materialize or mutate
 * cached graph state, checkpoints, or persistent caches.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {import('../services/ConflictAnalyzerService.js').ConflictAnalyzeOptions} [options]
 * @returns {Promise<import('../services/ConflictAnalyzerService.js').ConflictAnalysis>}
 */
export async function analyzeConflicts(options) {
  const analyzer = new ConflictAnalyzerService({ graph: this });
  return await analyzer.analyze(options);
}
