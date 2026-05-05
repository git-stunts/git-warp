import { EXIT_CODES, usageError, parseCommandArgs } from '../infrastructure.ts';
import { openGraph, applyCursorCeiling, emitCursorWarning } from '../shared.ts';
import { pathSchema } from '../schemas.ts';
import type { CliOptions } from '../types.ts';

const PATH_OPTIONS = {
  from: { type: 'string' },
  to: { type: 'string' },
  dir: { type: 'string' },
  label: { type: 'string', multiple: true },
  'max-depth': { type: 'string' },
};

type PathPayload = {
  readonly graph: string;
  readonly from: string;
  readonly to: string;
  readonly found: boolean;
  readonly path: readonly string[];
  readonly length: number;
};

type PathTraversalOptions = {
  readonly dir: 'out' | 'in' | 'both';
  readonly labelFilter?: string;
  readonly maxDepth?: number;
};

function endpointFrom(values: { readonly from: string | null }, positionals: readonly string[]): string {
  const value = values.from ?? positionals[0];
  if (value === undefined || value.length === 0) {
    throw usageError('path requires --from <id> or a source positional');
  }
  return value;
}

function endpointTo(values: { readonly to: string | null }, positionals: readonly string[]): string {
  const value = values.to ?? positionals[1];
  if (value === undefined || value.length === 0) {
    throw usageError('path requires --to <id> or a target positional');
  }
  return value;
}

function firstLabel(labels: readonly string[]): string | undefined {
  return labels[0];
}

function traversalOptions(values: {
  readonly dir?: 'out' | 'in' | 'both';
  readonly labels: readonly string[];
  readonly maxDepth?: number;
}): PathTraversalOptions {
  const options: PathTraversalOptions = { dir: values.dir ?? 'out' };
  const label = firstLabel(values.labels);
  if (label !== undefined) {
    return values.maxDepth !== undefined
      ? { ...options, labelFilter: label, maxDepth: values.maxDepth }
      : { ...options, labelFilter: label };
  }
  return values.maxDepth !== undefined
    ? { ...options, maxDepth: values.maxDepth }
    : options;
}

/** Handles `git warp path`: finds a shortest path through the read surface. */
export default async function handlePath({ options, args }: { options: CliOptions; args: string[] }): Promise<{ payload: PathPayload; exitCode: number }> {
  const { values, positionals } = parseCommandArgs(args, PATH_OPTIONS, pathSchema, { allowPositionals: true });
  const from = endpointFrom(values, positionals);
  const to = endpointTo(values, positionals);
  const { graph, graphName, persistence } = await openGraph(options);
  const cursorInfo = await applyCursorCeiling(graph, persistence, graphName);
  emitCursorWarning(cursorInfo, null);
  await graph.materialize();

  const result = await graph.traverse.shortestPath(from, to, traversalOptions(values));

  return {
    payload: {
      graph: graphName,
      from,
      to,
      found: result.found,
      path: result.path,
      length: result.length,
    },
    exitCode: result.found ? EXIT_CODES.OK : EXIT_CODES.NO_MATCH,
  };
}
