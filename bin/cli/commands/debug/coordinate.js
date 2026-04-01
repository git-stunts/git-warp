import { z } from 'zod';

import {
  buildTickReceipt,
  computeFrontierHash,
  countPatchesAtTick,
  countWriterPatchesAtTick,
} from '../../time-travel-shared.js';
import { EXIT_CODES, parseCommandArgs } from '../../infrastructure.js';

import {
  compareStrings,
  materializeForDebug,
  openDebugContext,
  resolveLamportCeiling,
} from './shared.js';

/** @typedef {import('../../types.js').CliOptions} CliOptions */

export const DEBUG_TOPIC = Object.freeze({
  name: 'coordinate',
  summary: 'Inspect the resolved observation coordinate and visible frontier',
});

const DEBUG_COORDINATE_OPTIONS = {
  'lamport-ceiling': { type: 'string' },
};

const debugCoordinateSchema = z.object({
  'lamport-ceiling': z.coerce.number().int().nonnegative().optional(),
}).strict().transform((val) => ({
  lamportCeiling: val['lamport-ceiling'] ?? null,
}));

/**
 * Determines how the observation coordinate was resolved.
 * @param {{ explicitLamportCeiling: number|null, activeCursor: {tick: number, mode?: string}|null }} params
 * @returns {'explicit'|'cursor'|'frontier'}
 */
function resolveCoordinateSource({ explicitLamportCeiling, activeCursor }) {
  if (explicitLamportCeiling !== null) {
    return 'explicit';
  }
  if (activeCursor) {
    return 'cursor';
  }
  return 'frontier';
}

/**
 * Builds a per-writer summary of visible vs total patches at the given tick.
 * @param {{tick: number, perWriter: Map<string, import('../../types.js').WriterTickInfo>}} params
 * @returns {Record<string, { tipSha: string|null, totalPatchCount: number, visiblePatchCount: number }>}
 */
function summarizePerWriterCoordinate({ tick, perWriter }) {
  return Object.fromEntries(
    [...perWriter.entries()]
      .sort(([a], [b]) => compareStrings(a, b))
      .map(([writerId, info]) => [writerId, {
        tipSha: info.tipSha,
        totalPatchCount: info.ticks.length,
        visiblePatchCount: countWriterPatchesAtTick(tick, info),
      }]),
  );
}

/**
 * Materializes state at the resolved coordinate and collects summary metrics.
 * @param {{
 *   graph: import('../../types.js').WarpGraphInstance,
 *   lamportCeiling: number|null,
 *   maxTick: number,
 *   tickCount: number,
 *   perWriter: Map<string, import('../../types.js').WriterTickInfo>
 * }} params
 * @returns {Promise<{
 *   tick: number,
 *   lamportCeiling: number|null,
 *   maxTick: number,
 *   tickCount: number,
 *   frontierDigest: string,
 *   patchCount: number,
 *   nodes: number,
 *   edges: number,
 *   properties: number,
 *   perWriter: Record<string, { tipSha: string|null, totalPatchCount: number, visiblePatchCount: number }>
 * }>}
 */
async function buildResolvedCoordinate({ graph, lamportCeiling, maxTick, tickCount, perWriter }) {
  const frontierDigest = await computeFrontierHash(perWriter);
  await materializeForDebug(graph, {
    lamportCeiling,
    collectReceipts: false,
  });

  const [nodes, edges, properties] = await Promise.all([
    graph.getNodes(),
    graph.getEdges(),
    graph.getPropertyCount(),
  ]);

  const tick = lamportCeiling ?? maxTick;

  return {
    tick,
    lamportCeiling,
    maxTick,
    tickCount,
    frontierDigest,
    patchCount: countPatchesAtTick(tick, perWriter),
    nodes: nodes.length,
    edges: edges.length,
    properties,
    perWriter: summarizePerWriterCoordinate({ tick, perWriter }),
  };
}

/**
 * Handles the 'coordinate' debug topic — resolves and displays the observation coordinate.
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: unknown, exitCode: number}>}
 */
export async function handleDebugTopic({ options, args }) {
  const { values: rawValues } = parseCommandArgs(args, DEBUG_COORDINATE_OPTIONS, debugCoordinateSchema);
  const values = /** @type {ReturnType<typeof debugCoordinateSchema.parse>} */ (rawValues);
  const { graph, graphName, activeCursor } = await openDebugContext(options);

  const lamportCeiling = resolveLamportCeiling(values.lamportCeiling, activeCursor);
  const coordinateSource = resolveCoordinateSource({
    explicitLamportCeiling: values.lamportCeiling,
    activeCursor,
  });

  const { ticks, maxTick, perWriter } = await graph.discoverTicks();
  const resolvedCoordinate = await buildResolvedCoordinate({
    graph, lamportCeiling, maxTick, tickCount: ticks.length, perWriter,
  });
  const tickReceipt = await buildTickReceipt({ tick: resolvedCoordinate.tick, perWriter, graph });

  return buildCoordinatePayload({
    graphName, coordinateSource, values, activeCursor, resolvedCoordinate, tickReceipt,
  });
}

/**
 * Assembles the final coordinate payload for CLI output.
 * @param {{ graphName: string, coordinateSource: string, values: { lamportCeiling: number|null }, activeCursor: {tick: number, mode?: string}|null, resolvedCoordinate: Record<string, unknown>, tickReceipt: unknown }} params
 * @returns {{ payload: unknown, exitCode: number }}
 */
function buildCoordinatePayload({ graphName, coordinateSource, values, activeCursor, resolvedCoordinate, tickReceipt }) {
  return {
    payload: {
      graph: graphName,
      debugTopic: 'coordinate',
      coordinateSource,
      requestedLamportCeiling: values.lamportCeiling,
      activeCursor: activeCursor
        ? { tick: activeCursor.tick, mode: activeCursor.mode ?? 'lamport' }
        : null,
      resolvedCoordinate,
      tickReceipt,
    },
    exitCode: EXIT_CODES.OK,
  };
}
