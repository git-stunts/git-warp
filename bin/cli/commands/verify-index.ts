import { EXIT_CODES, parseCommandArgs } from '../infrastructure.ts';
import { verifyIndexSchema } from '../schemas.ts';
import { openGraph, applyCursorCeiling, emitCursorWarning } from '../shared.ts';
import type { CliOptions } from '../types.ts';

const VERIFY_INDEX_OPTIONS = {
  seed: { type: 'string' },
  'sample-rate': { type: 'string' },
};

/**
 * Handles the `verify-index` command: samples alive nodes and cross-checks
 * bitmap index neighbors against adjacency ground truth.
 */
export default async function handleVerifyIndex({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: unknown; exitCode: number }> {
  const { values } = parseCommandArgs(
    args,
    VERIFY_INDEX_OPTIONS,
    verifyIndexSchema,
  );
  const { graph, graphName, persistence } = await openGraph(options);
  const cursorInfo = await applyCursorCeiling(graph, persistence, graphName);
  emitCursorWarning(cursorInfo, null);

  try {
    await graph.materialize();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      payload: { error: message },
      exitCode: EXIT_CODES.INTERNAL,
    };
  }

  let result;
  try {
    result = await Promise.resolve(graph.verifyIndex({
      ...(values.seed !== undefined ? { seed: values.seed } : {}),
      sampleRate: values.sampleRate,
    }));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const noIndex = /no bitmap index|cannot verify index|index not built/i.test(message);
    return {
      payload: { error: noIndex ? 'No bitmap index available after materialization' : message },
      exitCode: EXIT_CODES.INTERNAL,
    };
  }

  return {
    payload: {
      graph: graphName,
      ...result,
      totalChecks: result.passed + result.failed,
    },
    exitCode: result.failed > 0 ? EXIT_CODES.INTERNAL : EXIT_CODES.OK,
  };
}
