import { EXIT_CODES, parseCommandArgs } from '../infrastructure.js';
import { verifyIndexSchema } from '../schemas.js';
import { openGraph, applyCursorCeiling, emitCursorWarning } from '../shared.js';

/** @typedef {import('../types.js').CliOptions} CliOptions */
/** @typedef {import('../types.js').WarpGraphInstance} WarpGraphInstance */

const VERIFY_INDEX_OPTIONS = {
  seed: { type: 'string' },
  'sample-rate': { type: 'string' },
};

/**
 * Attempts to materialize the graph, returning an error payload on failure.
 * @param {WarpGraphInstance} graph
 * @returns {Promise<{payload: {error: string}, exitCode: number} | null>}
 */
async function tryMaterialize(graph) {
  try {
    await graph.materialize();
    return null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { payload: { error: message }, exitCode: EXIT_CODES.INTERNAL };
  }
}

/**
 * Attempts to verify the index, returning the result payload.
 * @param {WarpGraphInstance} graph
 * @param {{ seed?: number, sampleRate?: number }} params
 * @returns {Promise<{payload: Record<string, unknown>, exitCode: number}>}
 */
async function tryVerifyIndex(graph, params) {
  try {
    const result = await graph.verifyIndex(params);
    return { payload: { ...result, totalChecks: result.passed + result.failed }, exitCode: result.failed > 0 ? EXIT_CODES.INTERNAL : EXIT_CODES.OK };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const noIndex = /no bitmap index|cannot verify index|index not built/i.test(message);
    return { payload: { error: noIndex ? 'No bitmap index available after materialization' : message }, exitCode: EXIT_CODES.INTERNAL };
  }
}

/**
 * Handles the `verify-index` command: samples alive nodes and cross-checks
 * bitmap index neighbors against adjacency ground truth.
 *
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export default async function handleVerifyIndex({ options, args }) {
  const { values } = parseCommandArgs(args, VERIFY_INDEX_OPTIONS, verifyIndexSchema);
  const { graph, graphName, persistence } = await openGraph(options);
  const cursorInfo = await applyCursorCeiling(graph, persistence, graphName);
  emitCursorWarning(cursorInfo, null);

  const matError = await tryMaterialize(graph);
  if (matError !== null) {
    return matError;
  }

  const result = await tryVerifyIndex(graph, { seed: values.seed, sampleRate: values.sampleRate });
  const hasError = 'error' in result.payload;
  const payload = hasError ? result.payload : { graph: graphName, ...result.payload };
  return { payload, exitCode: result.exitCode };
}
