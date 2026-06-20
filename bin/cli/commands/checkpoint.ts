import { z } from 'zod';

import { EXIT_CODES, parseCommandArgs, usageError } from '../infrastructure.ts';
import { openGraph, readActiveCursor, readCheckpointDate } from '../shared.ts';
import type { CliOptions } from '../types.ts';

const CHECKPOINT_OPTIONS = {};

const checkpointSchema = z.object({}).strict();

function checkpointUsage(): never {
  throw usageError('Usage: warp-graph checkpoint <status|create|sync-coverage>');
}

type CheckpointPayload =
  | { graph: string; checkpoint: string | null; date: string | null }
  | { graph: string; checkpoint: string; status: 'created' }
  | { graph: string; status: 'coverage-synced' };

async function assertNoActiveCursor(
  persistence: Awaited<ReturnType<typeof openGraph>>['persistence'],
  graphName: string,
): Promise<void> {
  const cursor = await readActiveCursor(persistence, graphName);
  if (cursor !== null) {
    throw usageError('checkpoint create refuses to run while seek cursor is active; run git warp seek --latest first');
  }
}

async function checkpointStatus(options: CliOptions): Promise<{ payload: CheckpointPayload; exitCode: number }> {
  const { graph, graphName, persistence } = await openGraph(options);
  const checkpoint = await graph._readCheckpointSha();
  const date = await readCheckpointDate(persistence, checkpoint);
  return {
    payload: { graph: graphName, checkpoint, date },
    exitCode: EXIT_CODES.OK,
  };
}

async function createCheckpoint(options: CliOptions): Promise<{ payload: CheckpointPayload; exitCode: number }> {
  const { graph, graphName, persistence } = await openGraph(options);
  await assertNoActiveCursor(persistence, graphName);
  await graph.materialize();
  const checkpoint = await graph.createCheckpoint();
  return {
    payload: { graph: graphName, checkpoint, status: 'created' },
    exitCode: EXIT_CODES.OK,
  };
}

async function syncCoverage(options: CliOptions): Promise<{ payload: CheckpointPayload; exitCode: number }> {
  const { graph, graphName } = await openGraph(options);
  await graph.syncCoverage();
  return {
    payload: { graph: graphName, status: 'coverage-synced' },
    exitCode: EXIT_CODES.OK,
  };
}

export default async function handleCheckpoint(
  { options, args }: { options: CliOptions; args: string[] },
): Promise<{ payload: CheckpointPayload; exitCode: number }> {
  const action = args[0] ?? 'status';
  const rest = args.slice(1);
  parseCommandArgs(rest, CHECKPOINT_OPTIONS, checkpointSchema);

  if (action === 'status') { return await checkpointStatus(options); }
  if (action === 'create') { return await createCheckpoint(options); }
  if (action === 'sync-coverage') { return await syncCoverage(options); }
  return checkpointUsage();
}
