/**
 * Pure utility helpers for HttpSyncServer.
 *
 * JSON canonicalization, response builders, request validation
 * (route, content-type, body size, body parse), and auth initialization.
 * All functions are stateless and side-effect-free.
 *
 * @module domain/services/sync/HttpSyncServerHelpers
 */

import z from 'zod';
import SyncAuthService from './SyncAuthService.ts';
import SyncError from '../../errors/SyncError.ts';
import { validateSyncRequest } from './SyncPayloadSchema.ts';
import SyncSecret from './SyncSecret.ts';
import type { SyncRateLimitConfig } from './SyncRateLimiter.ts';
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

export const INTERNAL_SYNC_ERROR_CODE = 'E_SYNC_INTERNAL';

// ── Zod schemas ──────────────────────────────────────────────────────────────

export const authSchema = z.object({
  mode: z.enum(['enforce', 'log-only']).default('enforce'),
  keys: z.record(z.custom<SyncSecret>((v) => v instanceof SyncSecret, 'auth.keys values must be SyncSecret')).refine(
    (obj) => Object.keys(obj).length > 0,
    'auth.keys must not be empty',
  ),
  crypto: z.custom<CryptoPort | undefined>((v) => v === undefined || (typeof v === 'object' && v !== null)).optional(),
  logger: z.custom<LoggerPort | undefined>((v) => v === undefined || (typeof v === 'object' && v !== null)).optional(),
  wallClockMs: z.custom<(() => number) | undefined>((v) => v === undefined || typeof v === 'function').optional(),
  rateLimit: z.object({
    capacity: z.number().int().positive(),
    refillTokensPerSecond: z.number().positive(),
    clock: z.custom<() => number>((v) => typeof v === 'function', 'auth.rateLimit.clock must be a function'),
  }).strict().optional(),
}).strict();

export type AuthSchemaInput = z.infer<typeof authSchema>;

export interface GraphHandle {
  processSyncRequest: (req: SyncRequest) => Promise<unknown>; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
}

export const optionsSchema = z.object({
  httpPort: z.custom<HttpServerPort>(
    (v) => v !== null && v !== undefined && typeof v === 'object',
    'httpPort must be a non-null object',
  ),
  logger: z.custom<LoggerPort | undefined>((v) => v === undefined || (typeof v === 'object' && v !== null)).optional(),
  graph: z.custom<GraphHandle>(
    (v) => v !== null && v !== undefined && typeof v === 'object',
    'graph must be a non-null object',
  ),
  maxRequestBytes: z.number().int().positive().max(MAX_REQUEST_BYTES_CEILING).default(DEFAULT_MAX_REQUEST_BYTES),
  path: z.string().startsWith('/').default('/sync'),
  host: z.string().min(1).default('127.0.0.1'),
  auth: authSchema.optional(),
  unsafeAllowUnauthenticatedLocalhost: z.boolean().default(false),
  allowedWriters: z.array(z.string()).optional(),
}).strict().superRefine(validateAuthDefaults);

export type ParsedOptions = z.infer<typeof optionsSchema>;

type AuthDefaultValidationInput = {
  readonly auth?: AuthSchemaInput | undefined;
  readonly allowedWriters?: readonly string[] | undefined;
  readonly host: string;
  readonly unsafeAllowUnauthenticatedLocalhost: boolean;
};

function addConfigIssue(ctx: z.RefinementCtx, path: Array<string | number>, message: string): void {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    message,
    path,
  });
}

function validateAuthDefaults(data: AuthDefaultValidationInput, ctx: z.RefinementCtx): void {
  validateAllowedWritersAuthDependency(data, ctx);
  const localHost = isLocalSyncHost(data.host);
  if (data.auth === undefined) {
    validateUnauthenticatedDefaults(data, ctx, localHost);
    return;
  }
  validateAuthenticatedDefaults(data, ctx, localHost);
}

function validateAllowedWritersAuthDependency(
  data: AuthDefaultValidationInput,
  ctx: z.RefinementCtx,
): void {
  if (data.allowedWriters && data.allowedWriters.length > 0 && data.auth === undefined) {
    addConfigIssue(ctx, ['allowedWriters'], 'allowedWriters requires auth.keys to be configured');
  }
}

function validateAuthenticatedDefaults(
  data: AuthDefaultValidationInput,
  ctx: z.RefinementCtx,
  localHost: boolean,
): void {
  if (data.auth === undefined || localHost) {
    return;
  }
  validateNonLocalAuthMode(data.auth, ctx);
  validateNonLocalRateLimit(data.auth, ctx);
}

function validateNonLocalAuthMode(auth: AuthSchemaInput, ctx: z.RefinementCtx): void {
  if (auth.mode !== 'enforce') {
    addConfigIssue(ctx, ['auth', 'mode'], 'non-local sync hosts require auth.mode "enforce"');
  }
}

function validateNonLocalRateLimit(auth: AuthSchemaInput, ctx: z.RefinementCtx): void {
  if (auth.mode === 'enforce' && auth.rateLimit === undefined) {
    addConfigIssue(ctx, ['auth', 'rateLimit'], 'non-local sync hosts require auth.rateLimit');
  }
}

function validateUnauthenticatedDefaults(
  data: AuthDefaultValidationInput,
  ctx: z.RefinementCtx,
  localHost: boolean,
): void {
  if (!localHost) {
    addConfigIssue(ctx, ['auth'], 'sync auth is required for non-local sync hosts');
    return;
  }
  if (!data.unsafeAllowUnauthenticatedLocalhost) {
    addConfigIssue(
      ctx,
      ['unsafeAllowUnauthenticatedLocalhost'],
      'unauthenticated localhost sync requires unsafeAllowUnauthenticatedLocalhost: true',
    );
  }
}

export function isLocalSyncHost(host: string): boolean {
  return host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host === '[::1]';
}

// ── JSON canonicalization ────────────────────────────────────────────────────

function sortObjectKeys(obj: Record<string, unknown>): Record<string, unknown> { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  const sorted: Record<string, unknown> = {}; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = canonicalizeJson(obj[key]);
  }
  return sorted;
}

function canonicalizeJson(value: unknown): unknown { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (Array.isArray(value)) {
    return value.map(canonicalizeJson);
  }
  if (value !== null && value !== undefined && typeof value === 'object') {
    return sortObjectKeys(value as Record<string, unknown>); // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  }
  return value;
}

export function canonicalStringify(value: unknown): string { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  return JSON.stringify(canonicalizeJson(value)); // nosemgrep: ts-no-json-stringify-in-core -- 0025B
}

// ── Response builders ────────────────────────────────────────────────────────

export function errorResponse(status: number, message: string): JsonHttpResponse {
  return {
    status,
    headers: { 'content-type': 'application/json' },
    body: canonicalStringify({ error: message }),
  };
}

export function internalSyncErrorResponse(): JsonHttpResponse {
  return {
    status: 500,
    headers: { 'content-type': 'application/json' },
    body: canonicalStringify({
      code: INTERNAL_SYNC_ERROR_CODE,
      error: 'Sync failed',
    }),
  };
}

export function jsonResponse(data: unknown): JsonHttpResponse { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
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

  let parsed: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  try {
    parsed = bodyStr.length > 0 ? JSON.parse(bodyStr) : null; // nosemgrep: ts-no-json-parse-in-core -- 0025B
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
  keys: Record<string, SyncSecret>;
  mode?: 'enforce' | 'log-only';
  crypto?: CryptoPort;
  logger?: LoggerPort;
  wallClockMs?: () => number;
  allowedWriters?: string[];
  rateLimit?: SyncRateLimitConfig;
}

function buildAuthConfig(auth: AuthSchemaInput, allowedWriters: string[] | undefined): AuthConfig {
  return {
    keys: auth.keys,
    mode: auth.mode,
    ...cryptoField(auth),
    ...loggerField(auth),
    ...wallClockField(auth),
    ...rateLimitField(auth),
    ...allowedWritersField(allowedWriters),
  };
}

function cryptoField(auth: AuthSchemaInput): { readonly crypto?: CryptoPort } {
  if (auth.crypto === undefined) { return {}; }
  return { crypto: auth.crypto };
}

function loggerField(auth: AuthSchemaInput): { readonly logger?: LoggerPort } {
  if (auth.logger === undefined) { return {}; }
  return { logger: auth.logger };
}

function wallClockField(auth: AuthSchemaInput): { readonly wallClockMs?: () => number } {
  if (auth.wallClockMs === undefined) { return {}; }
  return { wallClockMs: auth.wallClockMs };
}

function rateLimitField(auth: AuthSchemaInput): { readonly rateLimit?: SyncRateLimitConfig } {
  if (auth.rateLimit === undefined) { return {}; }
  return { rateLimit: auth.rateLimit };
}

function allowedWritersField(allowedWriters: string[] | undefined): { readonly allowedWriters?: string[] } {
  if (allowedWriters === undefined) { return {}; }
  return { allowedWriters };
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

export function extractFrontierWriters(parsed: Record<string, unknown>): string[] { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  const { frontier } = parsed;
  if (frontier === null || frontier === undefined || typeof frontier !== 'object') {
    return [];
  }
  return Object.keys(frontier as Record<string, string>);
}

// ── Constructor options type ─────────────────────────────────────────────────

export interface HttpSyncServerOptions {
  httpPort: HttpServerPort;
  logger?: LoggerPort;
  graph: GraphHandle;
  path?: string;
  host?: string;
  maxRequestBytes?: number;
  auth?: {
    keys: Record<string, SyncSecret>;
    mode?: 'enforce' | 'log-only';
    crypto?: CryptoPort;
    logger?: LoggerPort;
    wallClockMs?: () => number;
    rateLimit?: SyncRateLimitConfig;
  };
  unsafeAllowUnauthenticatedLocalhost?: boolean;
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
