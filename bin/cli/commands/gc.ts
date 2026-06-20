import { z } from 'zod';

import { EXIT_CODES, parseCommandArgs, usageError } from '../infrastructure.ts';
import { openGraph, readActiveCursor } from '../shared.ts';
import type { CliOptions } from '../types.ts';

const GC_OPTIONS = {};

const gcSchema = z.object({}).strict();

function gcUsage(): never {
  throw usageError('Usage: warp-graph gc <status|maybe-run|run>');
}

type GcPayload =
  | { graph: string; metrics: ReturnType<Awaited<ReturnType<typeof openGraph>>['graph']['getGCMetrics']> }
  | { graph: string; result: ReturnType<Awaited<ReturnType<typeof openGraph>>['graph']['maybeRunGC']> }
  | { graph: string; result: ReturnType<Awaited<ReturnType<typeof openGraph>>['graph']['runGC']> };

async function assertNoActiveCursor(
  persistence: Awaited<ReturnType<typeof openGraph>>['persistence'],
  graphName: string,
): Promise<void> {
  const cursor = await readActiveCursor(persistence, graphName);
  if (cursor !== null) {
    throw usageError('gc refuses to run while seek cursor is active; run git warp seek --latest first');
  }
}

async function gcStatus(options: CliOptions): Promise<{ payload: GcPayload; exitCode: number }> {
  const { graph, graphName } = await openGraph(options);
  await graph.materialize();
  return {
    payload: { graph: graphName, metrics: graph.getGCMetrics() },
    exitCode: EXIT_CODES.OK,
  };
}

async function maybeRunGc(options: CliOptions): Promise<{ payload: GcPayload; exitCode: number }> {
  const { graph, graphName, persistence } = await openGraph(options);
  await assertNoActiveCursor(persistence, graphName);
  await graph.materialize();
  const result = graph.maybeRunGC();
  return {
    payload: { graph: graphName, result },
    exitCode: EXIT_CODES.OK,
  };
}

async function runGc(options: CliOptions): Promise<{ payload: GcPayload; exitCode: number }> {
  const { graph, graphName, persistence } = await openGraph(options);
  await assertNoActiveCursor(persistence, graphName);
  await graph.materialize();
  const result = graph.runGC();
  return {
    payload: { graph: graphName, result },
    exitCode: EXIT_CODES.OK,
  };
}

export default async function handleGc(
  { options, args }: { options: CliOptions; args: string[] },
): Promise<{ payload: GcPayload; exitCode: number }> {
  const action = args[0] ?? 'status';
  const rest = args.slice(1);
  parseCommandArgs(rest, GC_OPTIONS, gcSchema);

  if (action === 'status') { return await gcStatus(options); }
  if (action === 'maybe-run') { return await maybeRunGc(options); }
  if (action === 'run') { return await runGc(options); }
  return gcUsage();
}
