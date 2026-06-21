import { z } from 'zod';

import NodeHttpAdapter from '../../../src/infrastructure/adapters/NodeHttpAdapter.ts';
import SyncSecret from '../../../src/domain/services/sync/SyncSecret.ts';
import { EXIT_CODES, parseCommandArgs, usageError } from '../infrastructure.ts';
import { openGraph } from '../shared.ts';
import type { CliOptions } from '../types.ts';
import type { ServeOptions } from '../../../src/domain/capabilities/SyncCapability.ts';

const SERVE_OPTIONS = {
  port: { type: 'string' },
  host: { type: 'string' },
  path: { type: 'string' },
  'max-request-bytes': { type: 'string' },
  'auth-secret': { type: 'string' },
  'auth-key-id': { type: 'string' },
  'auth-mode': { type: 'string' },
  'allow-writer': { type: 'string', multiple: true },
  'unsafe-allow-unauthenticated-localhost': { type: 'boolean', default: false },
};

const serveInputSchema = z.object({
  port: z.coerce.number().int().nonnegative({ message: 'port must be a non-negative integer' }),
  host: z.string().min(1, 'Missing value for --host').optional(),
  path: z.string().min(1, 'Missing value for --path').optional(),
  'max-request-bytes': z.coerce.number().int().positive().optional(),
  'auth-secret': z.string().min(1, 'Missing value for --auth-secret').optional(),
  'auth-key-id': z.string().min(1, 'Missing value for --auth-key-id').optional(),
  'auth-mode': z.enum(['enforce', 'log-only']).optional(),
  'allow-writer': z.union([z.string().min(1), z.array(z.string().min(1))]).optional(),
  'unsafe-allow-unauthenticated-localhost': z.boolean().default(false),
}).strict();

type ServeInput = z.infer<typeof serveInputSchema>;

function optionalString(value: string | undefined): string | null {
  if (value === undefined) { return null; }
  return value;
}

function optionalNumber(value: number | undefined): number | null {
  if (value === undefined) { return null; }
  return value;
}

function optionalAuthMode(value: ServeInput['auth-mode']): 'enforce' | 'log-only' {
  if (value === undefined) { return 'enforce'; }
  return value;
}

function allowedWriterList(value: ServeInput['allow-writer']): string[] {
  if (value === undefined) { return []; }
  if (Array.isArray(value)) { return value; }
  return [value];
}

function transformServeInput(val: ServeInput) {
  return {
    port: val.port,
    host: optionalString(val.host),
    path: optionalString(val.path),
    maxRequestBytes: optionalNumber(val['max-request-bytes']),
    authSecret: optionalString(val['auth-secret']),
    authKeyId: optionalString(val['auth-key-id']),
    authMode: optionalAuthMode(val['auth-mode']),
    allowedWriters: allowedWriterList(val['allow-writer']),
    unsafeAllowUnauthenticatedLocalhost: val['unsafe-allow-unauthenticated-localhost'],
  };
}

const serveSchema = serveInputSchema.transform(transformServeInput);

type ServeValues = z.infer<typeof serveSchema>;

type ServePayload = {
  graph: string;
  url: string;
  status: 'serving';
  auth: 'configured' | 'unsafe-localhost';
};

function requireServeAuth(values: ServeValues): void {
  if (values.authKeyId !== null && values.authSecret === null) {
    throw usageError('--auth-key-id requires --auth-secret');
  }
  if (values.authSecret === null && !values.unsafeAllowUnauthenticatedLocalhost) {
    throw usageError('serve requires --auth-secret or --unsafe-allow-unauthenticated-localhost');
  }
}

function applyServeAddressOptions(options: ServeOptions, values: ServeValues): void {
  if (values.host !== null) { options.host = values.host; }
  if (values.path !== null) { options.path = values.path; }
  if (values.maxRequestBytes !== null) { options.maxRequestBytes = values.maxRequestBytes; }
  if (values.allowedWriters.length > 0) { options.allowedWriters = values.allowedWriters; }
}

function applyServeAuthOptions(options: ServeOptions, values: ServeValues): void {
  if (values.authSecret === null) {
    options.unsafeAllowUnauthenticatedLocalhost = values.unsafeAllowUnauthenticatedLocalhost;
    return;
  }
  const keyId = values.authKeyId ?? 'default';
  const keys: { [id: string]: SyncSecret } = {};
  keys[keyId] = SyncSecret.fromString(values.authSecret);
  options.auth = { keys, mode: values.authMode };
}

function buildServeOptions(values: ServeValues): ServeOptions {
  requireServeAuth(values);
  const options: ServeOptions = { port: values.port, httpPort: new NodeHttpAdapter() };
  applyServeAddressOptions(options, values);
  applyServeAuthOptions(options, values);
  return options;
}

export default async function handleServe(
  { options, args }: { options: CliOptions; args: string[] },
): Promise<{ payload: ServePayload; exitCode: number; close: () => Promise<void> }> {
  const { values } = parseCommandArgs(args, SERVE_OPTIONS, serveSchema);
  const { graph, graphName } = await openGraph(options);
  const handle = await graph.serve(buildServeOptions(values));
  return {
    payload: {
      graph: graphName,
      url: handle.url,
      status: 'serving',
      auth: values.authSecret !== null ? 'configured' : 'unsafe-localhost',
    },
    exitCode: EXIT_CODES.OK,
    close: async () => { await handle.close(); },
  };
}
