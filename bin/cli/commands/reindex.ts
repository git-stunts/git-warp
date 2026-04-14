import { EXIT_CODES, parseCommandArgs } from '../infrastructure.ts';
import { reindexSchema } from '../schemas.ts';
import { openGraph, applyCursorCeiling, emitCursorWarning } from '../shared.ts';
import type { CliOptions } from '../types.ts';

/**
 * Handles the `reindex` command: forces a full bitmap index rebuild
 * by clearing cached index state and re-materializing.
 */
export default async function handleReindex({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: unknown; exitCode: number }> {
  parseCommandArgs(args, {}, reindexSchema);

  const { graph, graphName, persistence } = await openGraph(options);
  const cursorInfo = await applyCursorCeiling(graph, persistence, graphName);
  emitCursorWarning(cursorInfo, null);

  // Clear cached index to force full rebuild
  graph.invalidateIndex();

  try {
    await graph.materialize();
  } catch (err) {
    return {
      payload: { error: (err as Error).message },
      exitCode: EXIT_CODES.INTERNAL,
    };
  }

  return {
    payload: {
      graph: graphName,
      status: 'ok',
      message: 'Index rebuilt successfully',
    },
    exitCode: EXIT_CODES.OK,
  };
}
