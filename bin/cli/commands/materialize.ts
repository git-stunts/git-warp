import WebCryptoAdapter from '../../../src/infrastructure/adapters/WebCryptoAdapter.ts';
import WarpRuntime from '../../../src/domain/WarpRuntime.ts';
import type { CorePersistence } from '../../../src/domain/types/WarpPersistence.ts';
import { EXIT_CODES, notFoundError } from '../infrastructure.ts';
import { createPersistence, listGraphNames, readActiveCursor, emitCursorWarning } from '../shared.ts';
import type { CliOptions, Persistence } from '../types.ts';

/** Materializes a single graph, creates a checkpoint, and returns summary stats. */
async function materializeOneGraph({ persistence, graphName, writerId, ceiling }: { persistence: Persistence; graphName: string; writerId: string; ceiling?: number }): Promise<{ graph: string; nodes: number; edges: number; properties: number; checkpoint: string | null; writers: Record<string, number>; patchCount: number }> {
  const graph = await WarpRuntime.open({
    persistence: persistence as unknown as CorePersistence,
    graphName,
    writerId,
    crypto: new WebCryptoAdapter(),
  });
  await graph.materialize(ceiling !== undefined ? { ceiling } : undefined);
  const nodes = await graph.getNodes();
  const edges = await graph.getEdges();
  const checkpoint = ceiling !== undefined ? null : await graph.createCheckpoint();
  const status = await graph.status();

  // Build per-writer patch counts for the view renderer
  const writers: Record<string, number> = {};
  let totalPatchCount = 0;
  for (const wId of Object.keys(status.frontier)) {
    const patches = await graph.getWriterPatches(wId);
    writers[wId] = patches.length;
    totalPatchCount += patches.length;
  }

  const properties = await graph.getPropertyCount();

  return {
    graph: graphName,
    nodes: nodes.length,
    edges: edges.length,
    properties,
    checkpoint,
    writers,
    patchCount: totalPatchCount,
  };
}

/** Handles the `materialize` command: materializes and checkpoints all graphs. */
export default async function handleMaterialize({ options }: { options: CliOptions }): Promise<{ payload: unknown; exitCode: number }> {
  const { persistence } = await createPersistence(options.repo);
  const graphNames = await listGraphNames(persistence);

  if (graphNames.length === 0) {
    return {
      payload: { graphs: [] },
      exitCode: EXIT_CODES.OK,
    };
  }

  const graphOpt = options.graph;
  const hasGraphOpt = typeof graphOpt === 'string' && graphOpt !== '';
  const targets = hasGraphOpt ? [graphOpt] : graphNames;

  if (hasGraphOpt && !graphNames.includes(graphOpt)) {
    throw notFoundError(`Graph not found: ${graphOpt}`);
  }

  const results: Array<{ graph: string; nodes?: number; edges?: number; properties?: number; checkpoint?: string | null; writers?: Record<string, number>; patchCount?: number; error?: string }> = [];
  let cursorWarningEmitted = false;
  for (const name of targets) {
    try {
      const cursor = await readActiveCursor(persistence, name);
      const ceiling = cursor ? cursor.tick : undefined;
      if (cursor && !cursorWarningEmitted) {
        emitCursorWarning({ active: true, tick: cursor.tick, maxTick: null }, null);
        cursorWarningEmitted = true;
      }
      const result = await materializeOneGraph({
        persistence,
        graphName: name,
        writerId: options.writer,
        ...(ceiling !== undefined ? { ceiling } : {}),
      });
      results.push(result);
    } catch (error) {
      results.push({
        graph: name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const allFailed = results.every((r) => 'error' in r);
  return {
    payload: { graphs: results },
    exitCode: allFailed ? EXIT_CODES.INTERNAL : EXIT_CODES.OK,
  };
}
