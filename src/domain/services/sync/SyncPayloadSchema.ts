/**
 * SyncPayloadSchema -- Zod schemas for sync protocol messages.
 *
 * Validates both shape and resource limits for sync requests and responses
 * at the trust boundary (HTTP ingress/egress). Prevents malformed or
 * oversized payloads from reaching the CRDT merge engine.
 *
 * @module domain/services/sync/SyncPayloadSchema
 * @see B64 -- Sync ingress payload validation
 */

import { z } from 'zod';

// ── Resource Limits ─────────────────────────────────────────────────────────

export interface SyncPayloadLimits {
  maxWritersInFrontier: number;
  maxPatches: number;
  maxOpsPerPatch: number;
  maxStringBytes: number;
  maxBlobBytes: number;
}

export const DEFAULT_LIMITS: Readonly<SyncPayloadLimits> = Object.freeze({
  maxWritersInFrontier: 10_000,
  maxPatches: 100_000,
  maxOpsPerPatch: 50_000,
  maxStringBytes: 4096,
  maxBlobBytes: 16 * 1024 * 1024,
});

// ── Shared Primitives ───────────────────────────────────────────────────────

function boundedString(maxBytes: number): z.ZodString {
  return z.string().max(maxBytes);
}

// ── Frontier Schema ─────────────────────────────────────────────────────────

function mapToStringRecord(map: Map<unknown, unknown>): Record<string, string> | null {
  const obj: Record<string, string> = {};
  for (const [k, v] of map) {
    if (typeof k !== 'string' || typeof v !== 'string') { return null; }
    obj[k] = v;
  }
  return obj;
}

function isPlainObject(value: unknown): boolean {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Normalizes a frontier value that may be a Map (cbor-x decodes maps)
 * or a plain object into a validated plain object.
 */
export function normalizeFrontier(value: unknown): Record<string, string> | null {
  if (value instanceof Map) {
    return mapToStringRecord(value);
  }
  if (isPlainObject(value)) {
    return value as Record<string, string>;
  }
  return null;
}

function frontierSchema(maxWriters: number): z.ZodType<Record<string, string>> {
  return z.record(
    boundedString(256),
    z.string(),
  ).refine(
    (obj) => Object.keys(obj).length <= maxWriters,
    (obj) => ({ message: `Frontier exceeds max writers: ${Object.keys(obj).length} > ${maxWriters}` }),
  ) as z.ZodType<Record<string, string>>;
}

// ── Op Schema ───────────────────────────────────────────────────────────────

const opSchema = z.object({
  type: z.string(),
}).passthrough();

// ── Patch Schema ────────────────────────────────────────────────────────────

function patchSchema(limits: SyncPayloadLimits): z.ZodObject<z.ZodRawShape> {
  return z.object({
    schema: z.number().int().min(1).optional(),
    writer: boundedString(limits.maxStringBytes).optional(),
    lamport: z.number().int().min(0).optional(),
    ops: z.array(opSchema).max(limits.maxOpsPerPatch),
    context: z.unknown().optional(),
  }).passthrough();
}

function patchEntrySchema(limits: SyncPayloadLimits): z.ZodObject<z.ZodRawShape> {
  return z.object({
    writerId: boundedString(limits.maxStringBytes),
    sha: z.string(),
    patch: patchSchema(limits),
  });
}

// ── Sync Request Schema ─────────────────────────────────────────────────────

export function createSyncRequestSchema(limits: SyncPayloadLimits = DEFAULT_LIMITS): z.ZodType {
  return z.object({
    type: z.literal('sync-request'),
    frontier: frontierSchema(limits.maxWritersInFrontier),
  }).strict();
}

const SyncRequestSchema = createSyncRequestSchema();

// ── Sync Response Schema ────────────────────────────────────────────────────

export function createSyncResponseSchema(limits: SyncPayloadLimits = DEFAULT_LIMITS): z.ZodType {
  return z.object({
    type: z.literal('sync-response'),
    frontier: frontierSchema(limits.maxWritersInFrontier),
    patches: z.array(patchEntrySchema(limits)).max(limits.maxPatches),
  }).passthrough();
}

const SyncResponseSchema = createSyncResponseSchema();

// ── Validation Helpers ──────────────────────────────────────────────────────

function normalizePayloadFrontier(payload: unknown): string | null {
  if (!isPlainObject(payload)) { return null; }
  const p = payload as Record<string, unknown>;
  if (!(p['frontier'] instanceof Map)) { return null; }
  const normalized = normalizeFrontier(p['frontier']);
  if (normalized === null) {
    return 'Invalid frontier: Map contains non-string entries';
  }
  p['frontier'] = normalized;
  return null;
}

/**
 * Validates a sync request payload. Returns the parsed value or throws.
 */
export function validateSyncRequest(
  payload: unknown,
  limits: SyncPayloadLimits = DEFAULT_LIMITS,
): { ok: true; value: { type: 'sync-request'; frontier: Record<string, string> } } | { ok: false; error: string } {
  const frontierErr = normalizePayloadFrontier(payload);
  if (frontierErr !== null) {
    return { ok: false, error: frontierErr };
  }

  const schema = limits === DEFAULT_LIMITS ? SyncRequestSchema : createSyncRequestSchema(limits);
  const result = schema.safeParse(payload);
  if (!result.success) {
    return { ok: false, error: result.error.message };
  }
  return { ok: true, value: result.data as { type: 'sync-request'; frontier: Record<string, string> } };
}

/**
 * Validates a sync response payload. Returns the parsed value or an error.
 */
export function validateSyncResponse(
  payload: unknown,
  limits: SyncPayloadLimits = DEFAULT_LIMITS,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const frontierErr = normalizePayloadFrontier(payload);
  if (frontierErr !== null) {
    return { ok: false, error: frontierErr };
  }

  const schema = limits === DEFAULT_LIMITS ? SyncResponseSchema : createSyncResponseSchema(limits);
  const result = schema.safeParse(payload);
  if (!result.success) {
    return { ok: false, error: result.error.message };
  }
  return { ok: true, value: result.data };
}
