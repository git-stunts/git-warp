import process from 'node:process';
import { z } from 'zod';

import { compactStringify } from '../../presenters/json.ts';
import { EXIT_CODES, parseCommandArgs, usageError } from '../infrastructure.ts';
import { openGraph } from '../shared.ts';
import type { CliOptions, WarpGraphInstance } from '../types.ts';
import type { StateDiffResult } from '../../../src/domain/services/state/StateDiff.ts';

const WATCH_OPTIONS = {
  poll: { type: 'string' },
};

const watchSchema = z.object({
  poll: z.coerce.number().int().min(1000, 'poll must be >= 1000').optional(),
}).strict();

type WatchValues = z.infer<typeof watchSchema>;
type WatchOptions = Parameters<WarpGraphInstance['watch']>[1];
type WatchSubscription = ReturnType<WarpGraphInstance['watch']>;

type WatchPayload = {
  graph: string;
  pattern: string;
  status: 'watching';
  eventFormat: 'ndjson';
};

function parseWatchArgs(args: string[]): { pattern: string; values: WatchValues } {
  const { values, positionals } = parseCommandArgs(args, WATCH_OPTIONS, watchSchema, {
    allowPositionals: true,
  });
  if (positionals.length > 1) {
    throw usageError('Usage: warp-graph watch [pattern] [--poll <ms>]');
  }
  return { pattern: positionals[0] ?? '*', values };
}

function watchOptions(graphName: string, pattern: string, values: WatchValues): WatchOptions {
  return {
    ...(values.poll !== undefined ? { poll: values.poll } : {}),
    onChange(diff: StateDiffResult) {
      process.stdout.write(`${compactStringify({ type: 'change', graph: graphName, pattern, diff })}\n`);
    },
    onError(error) {
      process.stderr.write(`watch error: ${String(error)}\n`);
    },
  };
}

function closeWatch(subscription: WatchSubscription): () => Promise<void> {
  return () => {
    subscription.unsubscribe();
    return Promise.resolve();
  };
}

export default async function handleWatch(
  { options, args }: { options: CliOptions; args: string[] },
): Promise<{ payload: WatchPayload; exitCode: number; close: () => Promise<void> }> {
  const { pattern, values } = parseWatchArgs(args);
  const { graph, graphName } = await openGraph(options);
  const subscription = graph.watch(pattern, watchOptions(graphName, pattern, values));

  return {
    payload: {
      graph: graphName,
      pattern,
      status: 'watching',
      eventFormat: 'ndjson',
    },
    exitCode: EXIT_CODES.OK,
    close: closeWatch(subscription),
  };
}
