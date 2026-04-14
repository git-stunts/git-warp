import { z } from 'zod';

import {
  buildTickReceipt,
  computeFrontierHash,
  countPatchesAtTick,
  countWriterPatchesAtTick,
} from '../../time-travel-shared.ts';
import { EXIT_CODES, parseCommandArgs } from '../../infrastructure.ts';

import {
  compareStrings,
  materializeForDebug,
  openDebugContext,
  resolveLamportCeiling,
} from './shared.ts';
import type { CliOptions, WarpGraphInstance, WriterTickInfo, CursorBlob } from '../../types.ts';

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

/** Determines how the observation coordinate was resolved. */
function resolveCoordinateSource({ explicitLamportCeiling, activeCursor }: { explicitLamportCeiling: number | null; activeCursor: CursorBlob | null }): 'explicit' | 'cursor' | 'frontier' {
  if (explicitLamportCeiling !== null) {
    return 'explicit';
  }
  if (activeCursor) {
    return 'cursor';
  }
  return 'frontier';
}

/** Builds a per-writer summary of visible vs total patches at the given tick. */
function summarizePerWriterCoordinate({ tick, perWriter }: { tick: number; perWriter: Map<string, WriterTickInfo> }): Record<string, { tipSha: string | null; totalPatchCount: number; visiblePatchCount: number }> {
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

/** Materializes state at the resolved coordinate and collects summary metrics. */
async function buildResolvedCoordinate({ graph, lamportCeiling, maxTick, tickCount, perWriter }: {
  graph: WarpGraphInstance;
  lamportCeiling: number | null;
  maxTick: number;
  tickCount: number;
  perWriter: Map<string, WriterTickInfo>;
}): Promise<{
  tick: number;
  lamportCeiling: number | null;
  maxTick: number;
  tickCount: number;
  frontierDigest: string;
  patchCount: number;
  nodes: number;
  edges: number;
  properties: number;
  perWriter: Record<string, { tipSha: string | null; totalPatchCount: number; visiblePatchCount: number }>;
}> {
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

/** Handles the 'coordinate' debug topic — resolves and displays the observation coordinate. */
export async function handleDebugTopic({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: unknown; exitCode: number }> {
  const { values: rawValues } = parseCommandArgs(args, DEBUG_COORDINATE_OPTIONS, debugCoordinateSchema);
  const values = rawValues as ReturnType<typeof debugCoordinateSchema.parse>;
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

/** Assembles the final coordinate payload for CLI output. */
function buildCoordinatePayload({ graphName, coordinateSource, values, activeCursor, resolvedCoordinate, tickReceipt }: {
  graphName: string;
  coordinateSource: string;
  values: { lamportCeiling: number | null };
  activeCursor: CursorBlob | null;
  resolvedCoordinate: Record<string, unknown>;
  tickReceipt: unknown;
}): { payload: unknown; exitCode: number } {
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
