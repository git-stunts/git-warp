import { z } from 'zod';

import SyncSecret from '../../../src/domain/services/sync/SyncSecret.ts';
import { EXIT_CODES, parseCommandArgs, usageError } from '../infrastructure.ts';
import { openGraph } from '../shared.ts';
import type { CliOptions, WarpGraphInstance } from '../types.ts';
import type { SyncRequest, SyncWithOptions } from '../../../src/domain/capabilities/SyncCapability.ts';

const SYNC_EMPTY_OPTIONS = {};

const SYNC_WITH_OPTIONS = {
  path: { type: 'string' },
  retries: { type: 'string' },
  'base-delay-ms': { type: 'string' },
  'max-delay-ms': { type: 'string' },
  'timeout-ms': { type: 'string' },
  materialize: { type: 'boolean', default: false },
  'auth-secret': { type: 'string' },
  'auth-key-id': { type: 'string' },
};

const syncEmptySchema = z.object({}).strict();

const syncWithInputSchema = z.object({
  path: z.string().min(1, 'Missing value for --path').optional(),
  retries: z.coerce.number().int().nonnegative().optional(),
  'base-delay-ms': z.coerce.number().int().nonnegative().optional(),
  'max-delay-ms': z.coerce.number().int().nonnegative().optional(),
  'timeout-ms': z.coerce.number().int().positive().optional(),
  materialize: z.boolean().default(false),
  'auth-secret': z.string().min(1, 'Missing value for --auth-secret').optional(),
  'auth-key-id': z.string().min(1, 'Missing value for --auth-key-id').optional(),
}).strict();

type SyncWithInput = z.infer<typeof syncWithInputSchema>;

function optionalString(value: string | undefined): string | null {
  if (value === undefined) { return null; }
  return value;
}

function optionalNumber(value: number | undefined): number | null {
  if (value === undefined) { return null; }
  return value;
}

function transformSyncWithInput(val: SyncWithInput) {
  return {
    path: optionalString(val.path),
    retries: optionalNumber(val.retries),
    baseDelayMs: optionalNumber(val['base-delay-ms']),
    maxDelayMs: optionalNumber(val['max-delay-ms']),
    timeoutMs: optionalNumber(val['timeout-ms']),
    materialize: val.materialize,
    authSecret: optionalString(val['auth-secret']),
    authKeyId: optionalString(val['auth-key-id']),
  };
}

const syncWithSchema = syncWithInputSchema.transform(transformSyncWithInput);

type SyncWithValues = z.infer<typeof syncWithSchema>;

function syncUsage(): never {
  throw usageError('Usage: warp-graph sync <status|request|with>');
}

type SyncStatusPayload = {
  graph: string;
  status: Awaited<ReturnType<WarpGraphInstance['status']>>;
};

type SyncRequestPayload = {
  graph: string;
  request: SyncRequest;
};

type SyncWithPayload = {
  graph: string;
  remote: string;
  applied: number;
  attempts: number;
  skippedWriters: Awaited<ReturnType<WarpGraphInstance['syncWith']>>['skippedWriters'];
  materialized: boolean;
};

type SyncPayload = SyncStatusPayload | SyncRequestPayload | SyncWithPayload;

async function syncStatus(options: CliOptions): Promise<{ payload: SyncPayload; exitCode: number }> {
  const { graph, graphName } = await openGraph(options);
  return {
    payload: { graph: graphName, status: await graph.status() },
    exitCode: EXIT_CODES.OK,
  };
}

async function syncRequest(options: CliOptions): Promise<{ payload: SyncPayload; exitCode: number }> {
  const { graph, graphName } = await openGraph(options);
  return {
    payload: { graph: graphName, request: await graph.createSyncRequest() },
    exitCode: EXIT_CODES.OK,
  };
}

function requireSyncAuth(values: SyncWithValues): void {
  if (values.authKeyId !== null && values.authSecret === null) {
    throw usageError('--auth-key-id requires --auth-secret');
  }
}

function applySyncRetryOptions(options: SyncWithOptions, values: SyncWithValues): void {
  if (values.retries !== null) { options.retries = values.retries; }
  if (values.baseDelayMs !== null) { options.baseDelayMs = values.baseDelayMs; }
  if (values.maxDelayMs !== null) { options.maxDelayMs = values.maxDelayMs; }
}

function applySyncTransportOptions(options: SyncWithOptions, values: SyncWithValues): void {
  if (values.path !== null) { options.path = values.path; }
  if (values.timeoutMs !== null) { options.timeoutMs = values.timeoutMs; }
  if (values.materialize) { options.materialize = true; }
}

function syncAuth(values: SyncWithValues): NonNullable<SyncWithOptions['auth']> | null {
  if (values.authSecret === null) { return null; }
  const auth = { secret: SyncSecret.fromString(values.authSecret) };
  if (values.authKeyId !== null) { return { ...auth, keyId: values.authKeyId }; }
  return auth;
}

function buildSyncWithOptions(values: SyncWithValues): SyncWithOptions {
  requireSyncAuth(values);
  const options: SyncWithOptions = {};
  applySyncTransportOptions(options, values);
  applySyncRetryOptions(options, values);
  const auth = syncAuth(values);
  if (auth !== null) { options.auth = auth; }
  return options;
}

async function syncWith(
  options: CliOptions,
  args: string[],
): Promise<{ payload: SyncPayload; exitCode: number }> {
  const { values, positionals } = parseCommandArgs(args, SYNC_WITH_OPTIONS, syncWithSchema, {
    allowPositionals: true,
  });
  const remote = positionals[0];
  if (remote === undefined || remote.length === 0) {
    throw usageError('Usage: warp-graph sync with <url> [options]');
  }
  if (positionals.length > 1) {
    throw usageError('sync with accepts exactly one remote URL');
  }
  const { graph, graphName } = await openGraph(options);
  const result = await graph.syncWith(remote, buildSyncWithOptions(values));
  return {
    payload: {
      graph: graphName,
      remote,
      applied: result.applied,
      attempts: result.attempts,
      skippedWriters: result.skippedWriters,
      materialized: result.state !== undefined,
    },
    exitCode: EXIT_CODES.OK,
  };
}

export default async function handleSync(
  { options, args }: { options: CliOptions; args: string[] },
): Promise<{ payload: SyncPayload; exitCode: number }> {
  const action = args[0] ?? 'status';
  const rest = args.slice(1);

  if (action === 'status') {
    parseCommandArgs(rest, SYNC_EMPTY_OPTIONS, syncEmptySchema);
    return await syncStatus(options);
  }
  if (action === 'request') {
    parseCommandArgs(rest, SYNC_EMPTY_OPTIONS, syncEmptySchema);
    return await syncRequest(options);
  }
  if (action === 'with') { return await syncWith(options, rest); }
  return syncUsage();
}
