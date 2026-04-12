/**
 * Pure utility helpers for HttpSyncServer.
 *
 * JSON canonicalization, response builders, request validation
 * (route, content-type, body size, body parse), and auth initialization.
 * All functions are stateless and side-effect-free.
 *
 * @module domain/services/sync/HttpSyncServerHelpers
 */

import { z } from 'zod';
import SyncAuthService from './SyncAuthService.js';
import SyncError from '../../errors/SyncError.ts';
import { validateSyncRequest } from './SyncPayloadSchema.js';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import type HttpServerPort from '../../../ports/HttpServerPort.ts';
import type { SyncRequest } from './SyncProtocol.ts';

// ── Constants ────────────────────────────────────────────────────────────────

export const DEFAULT_MAX_REQUEST_BYTES = 4 * 1024 * 1024;
export const MAX_REQUEST_BYTES_CEILING = 128 * 1024 * 1024; // 134217728

// ── Response shape ───────────────────────────────────────────────────────────

export interface JsonHttpResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

// ── Zod schemas ──────────────────────────────────────────────────────────────

export const authSchema = z.object({
  mode: z.enum(['enforce', 'log-only']).default('enforce'),
  keys: z.record(z.string()).refine(
    (obj) => Object.keys(obj).length > 0,
    'auth.keys must not be empty',
  ),
  crypto: z.custom<CryptoPort | undefined>((v) => v === undefined || (typeof v === 'object' && v !== null)).optional(),
  logger: z.custom<LoggerPort | undefined>((v) => v === undefined || (typeof v === 'object' && v !== null)).optional(),
  wallClockMs: z.custom<(() => number) | undefined>((v) => v === undefined || typeof v === 'function').optional(),
}).strict();

export type AuthSchemaInput = z.infer<typeof authSchema>;

export interface GraphHandle {
  processSyncRequest: (req: SyncRequest) => Promise<unknown>;
}

export const optionsSchema = z.object({
  httpPort: z.custom<HttpServerPort>(
    (v) => v !== null && v !== undefined && typeof v === 'object',
    'httpPort must be a non-null object',
  ),
  graph: z.custom<GraphHandle>(
    (v) => v !== null && v !== undefined && typeof v === 'object',
    'graph must be a non-null object',
  ),
  maxRequestBytes: z.number().int().positive().max(MAX_REQUEST_BYTES_CEILING).default(DEFAULT_MAX_REQUEST_BYTES),
  path: z.string().startsWith('/').default('/sync'),
  host: z.string().min(1).default('127.0.0.1'),
  auth: authSchema.optional(),
  allowedWriters: z.array(z.string()).optional(),
}).strict().superRefine((data, ctx) => {
  if (data.allowedWriters && data.allowedWriters.length > 0 && !data.auth) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'allowedWriters requires auth.keys to be configured',
      path: ['allowedWriters'],
    });
  }
});

export type ParsedOptions = z.infer<typeof optionsSchema>;

// ── JSON canonicalization ────────────────────────────────────────────────────

function sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = canonicalizeJson(obj[key]);
  }
  return sorted;
}

function canonicalizeJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  if (value !== null && value !== undefined && typeof value === 'object') {
    return sortObjectKeys(value as Record<string, unknown>);
  }
  return value;
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(canonicalizeJson(value));
}

// ── Response builders ────────────────────────────────────────────────────────

export function errorResponse(status: number, message: string): JsonHttpResponse {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: canonicalStringify({ error: message }),
  };
}

export function jsonResponse(data: unknown): JsonHttpResponse {
  return {
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: canonicalStringify(data),
  };
}

// ── Request validators ───────────────────────────────────────────────────────

export function checkContentType(headers: Record<string, string>): JsonHttpResponse | null {
  const contentType = String(headers['content-type'] ?? '').toLowerCase();
  if (contentType.length > 0 && !contentType.startsWith('application/json')) {
    return errorResponse(400, 'Expected application/json');
  }
  return null;
}

export function safeParseUrl(
  url: string,
  headers: Record<string, string>,
  defaultHost: string,
): URL | null {
  const rawUrl = url.length > 0 ? url : '/';
  const hostHeader = String((headers as { host?: string }).host ?? '');
  const host = hostHeader.length > 0 ? hostHeader : defaultHost;
  try {
    return new URL(rawUrl, `http://${host}`);
  } catch {
    return null;
  }
}

export function validateRoute(
  request: { method: string; url: string; headers: Record<string, string> },
  expectedPath: string,
  defaultHost: string,
): JsonHttpResponse | null {
  const requestUrl = safeParseUrl(request.url, request.headers, defaultHost);
  if (requestUrl === null) {
    return errorResponse(400, 'Invalid URL');
  }
  if (requestUrl.pathname !== expectedPath) {
    return errorResponse(404, 'Not Found');
  }
  if (request.method !== 'POST') {
    return errorResponse(405, 'Method Not Allowed');
  }
  return null;
}

export function checkBodySize(body: Uint8Array | undefined, maxBytes: number): JsonHttpResponse | null {
  if (body && body.length > maxBytes) {
    return errorResponse(413, 'Request too large');
  }
  return null;
}

export type ParseBodyResult =
  | { error: JsonHttpResponse; parsed: null }
  | { error: null; parsed: SyncRequest };

export function parseBody(body: Uint8Array | undefined): ParseBodyResult {
  const bodyStr = body ? new TextDecoder().decode(body) : '';

  let parsed: unknown;
  try {
    parsed = bodyStr.length > 0 ? JSON.parse(bodyStr) : null;
  } catch {
    return { error: errorResponse(400, 'Invalid JSON'), parsed: null };
  }

  const validation = validateSyncRequest(parsed);
  if (!validation.ok) {
    return { error: errorResponse(400, `Invalid sync request: ${validation.error}`), parsed: null };
  }

  return { error: null, parsed: validation.value as SyncRequest };
}

// ── Auth helpers ─────────────────────────────────────────────────────────────

interface AuthConfig {
  keys: Record<string, string>;
  mode?: 'enforce' | 'log-only';
  crypto?: CryptoPort;
  logger?: LoggerPort;
  wallClockMs?: () => number;
  allowedWriters?: string[];
}

function buildAuthConfig(auth: AuthSchemaInput, allowedWriters: string[] | undefined): AuthConfig {
  const cfg: AuthConfig = { keys: auth.keys, mode: auth.mode };
  if (auth.crypto !== undefined) { cfg.crypto = auth.crypto; }
  if (auth.logger !== undefined) { cfg.logger = auth.logger; }
  if (auth.wallClockMs !== undefined) { cfg.wallClockMs = auth.wallClockMs; }
  if (allowedWriters !== undefined) { cfg.allowedWriters = allowedWriters; }
  return cfg;
}

export interface AuthInit {
  auth: SyncAuthService | null;
  authMode: string | null;
}

export function initAuth(auth: AuthSchemaInput | undefined, allowedWriters: string[] | undefined): AuthInit {
  if (auth) {
    return {
      auth: new SyncAuthService(buildAuthConfig(auth, allowedWriters)),
      authMode: auth.mode,
    };
  }
  return { auth: null, authMode: null };
}

// ── Server lifecycle helpers ─────────────────────────────────────────────────

import type { HttpServerHandle } from '../../../ports/HttpServerPort.ts';

export function waitForListen(server: HttpServerHandle, port: number, host: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.listen(port, host, (err?: Error | null) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

export interface ListenResult {
  url: string;
  close: () => Promise<void>;
}

export function buildListenResult(opts: {
  server: HttpServerHandle;
  port: number;
  host: string;
  path: string;
}): ListenResult {
  const { server, port, host, path } = opts;
  const address = server.address();
  const actualPort = typeof address === 'object' && address !== null ? address.port : port;
  const url = `http://${host}:${actualPort}${path}`;

  const close = (): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      server.close((err?: Error) => {
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
    });

  return { url, close };
}

// ── Frontier extraction ──────────────────────────────────────────────────────

export function extractFrontierWriters(parsed: Record<string, unknown>): string[] {
  const { frontier } = parsed;
  if (frontier === null || frontier === undefined || typeof frontier !== 'object') {
    return [];
  }
  return Object.keys(frontier as Record<string, string>);
}

// ── Constructor options type ─────────────────────────────────────────────────

export interface HttpSyncServerOptions {
  httpPort: HttpServerPort;
  graph: GraphHandle;
  path?: string;
  host?: string;
  maxRequestBytes?: number;
  auth?: {
    keys: Record<string, string>;
    mode?: 'enforce' | 'log-only';
    crypto?: CryptoPort;
    logger?: LoggerPort;
    wallClockMs?: () => number;
  };
  allowedWriters?: string[];
}

export function parseOptions(options: HttpSyncServerOptions): ParsedOptions {
  try {
    return optionsSchema.parse(options);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const messages = err.issues.map((i) => i.message).join('; ');
      throw new SyncError(`HttpSyncServer config: ${messages}`, { code: 'E_SYNC_PROTOCOL' });
    }
    throw err;
  }
}
