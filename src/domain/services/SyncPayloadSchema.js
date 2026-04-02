/**
 * SyncPayloadSchema -- Zod schemas for sync protocol messages.
 *
 * Validates both shape and resource limits for sync requests and responses
 * at the trust boundary (HTTP ingress/egress). Prevents malformed or
 * oversized payloads from reaching the CRDT merge engine.
 *
 * @module domain/services/SyncPayloadSchema
 * @see B64 -- Sync ingress payload validation
 */

import { z } from 'zod';

// ── Resource Limits ─────────────────────────────────────────────────────────

/**
 * Default resource limits for sync payload validation.
 * Configurable per-deployment via `createSyncResponseSchema(limits)`.
 *
 * @typedef {Object} SyncPayloadLimits
 * @property {number} maxWritersInFrontier - Maximum writers in a frontier object
 * @property {number} maxPatches - Maximum patches in a sync response
 * @property {number} maxOpsPerPatch - Maximum operations per patch
 * @property {number} maxStringBytes - Maximum bytes for string values (writer ID, node ID, etc.)
 * @property {number} maxBlobBytes - Maximum bytes for blob values
 */

/** @type {Readonly<SyncPayloadLimits>} */
export const DEFAULT_LIMITS = Object.freeze({
  maxWritersInFrontier: 10_000,
  maxPatches: 100_000,
  maxOpsPerPatch: 50_000,
  maxStringBytes: 4096,
  maxBlobBytes: 16 * 1024 * 1024,
});

// ── Schema Version ──────────────────────────────────────────────────────────

/**
 * Current sync protocol schema version.
 * Responses with unknown versions are rejected.
 */
export const SYNC_SCHEMA_VERSION = 1;

// ── Shared Primitives ───────────────────────────────────────────────────────

/**
 * Bounded string: rejects strings exceeding maxStringBytes.
 * @param {number} maxBytes
 * @returns {z.ZodString}
 */
function boundedString(maxBytes) {
  return z.string().max(maxBytes);
}

// ── Frontier Schema ─────────────────────────────────────────────────────────

/**
 * Converts a Map to a plain object, returning null if any entry is non-string.
 * @param {Map<unknown, unknown>} map
 * @returns {Record<string, string>|null}
 */
function mapToStringRecord(map) {
  /** @type {Record<string, string>} */
  const obj = {};
  for (const [k, v] of map) {
    if (typeof k !== 'string' || typeof v !== 'string') {
      return null;
    }
    obj[k] = v;
  }
  return obj;
}

/**
 * Returns true if value is a non-null, non-array object.
 * @param {unknown} value
 * @returns {boolean}
 */
function isPlainObject(value) {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Normalizes a frontier value that may be a Map (cbor-x decodes maps)
 * or a plain object into a validated plain object.
 *
 * @param {unknown} value
 * @returns {Record<string, string>|null} Normalized object, or null if invalid
 */
export function normalizeFrontier(value) {
  if (value instanceof Map) {
    return mapToStringRecord(value);
  }
  if (isPlainObject(value)) {
    return /** @type {Record<string, string>} */ (value);
  }
  return null;
}

/**
 * Creates a frontier schema with a size limit.
 *
 * Frontier values are strings (typically hex SHAs) but we don't enforce
 * hex format here — semantic SHA validation happens at a higher level.
 * This schema validates shape + resource limits only.
 *
 * @param {number} maxWriters
 * @returns {z.ZodType<Record<string, string>>}
 */
function frontierSchema(maxWriters) {
  return /** @type {z.ZodType<Record<string, string>>} */ (z.record(
    boundedString(256),
    z.string(),
  ).refine(
    (obj) => Object.keys(obj).length <= maxWriters,
    (obj) => ({ message: `Frontier exceeds max writers: ${Object.keys(obj).length} > ${maxWriters}` }),
  ));
}

// ── Op Schema ───────────────────────────────────────────────────────────────

/**
 * Minimal op validation — checks for type field and basic shape.
 * Deeper semantic validation happens in JoinReducer/WarpMessageCodec.
 */
const opSchema = z.object({
  type: z.string(),
}).passthrough();

// ── Patch Schema ────────────────────────────────────────────────────────────

/**
 * Creates a patch schema with ops limit.
 * @param {SyncPayloadLimits} limits
 */
function patchSchema(limits) {
  return z.object({
    schema: z.number().int().min(1).optional(),
    writer: boundedString(limits.maxStringBytes).optional(),
    lamport: z.number().int().min(0).optional(),
    ops: z.array(opSchema).max(limits.maxOpsPerPatch),
    context: z.unknown().optional(),
  }).passthrough();
}

/**
 * Creates a patches-array entry schema.
 * @param {SyncPayloadLimits} limits
 */
function patchEntrySchema(limits) {
  return z.object({
    writerId: boundedString(limits.maxStringBytes),
    sha: z.string(),
    patch: patchSchema(limits),
  });
}

// ── Sync Request Schema ─────────────────────────────────────────────────────

/**
 * Creates a validated SyncRequest schema.
 * @param {SyncPayloadLimits} [limits]
 * @returns {z.ZodType}
 */
export function createSyncRequestSchema(limits = DEFAULT_LIMITS) {
  return z.object({
    type: z.literal('sync-request'),
    frontier: frontierSchema(limits.maxWritersInFrontier),
  }).strict();
}

/** Default SyncRequest schema with default limits */
export const SyncRequestSchema = createSyncRequestSchema();

// ── Sync Response Schema ────────────────────────────────────────────────────

/**
 * Creates a validated SyncResponse schema.
 * @param {SyncPayloadLimits} [limits]
 * @returns {z.ZodType}
 */
export function createSyncResponseSchema(limits = DEFAULT_LIMITS) {
  return z.object({
    type: z.literal('sync-response'),
    frontier: frontierSchema(limits.maxWritersInFrontier),
    patches: z.array(patchEntrySchema(limits)).max(limits.maxPatches),
  }).passthrough();
}

/** Default SyncResponse schema with default limits */
export const SyncResponseSchema = createSyncResponseSchema();

// ── Validation Helpers ──────────────────────────────────────────────────────

/**
 * Normalizes a Map frontier on a payload object in-place.
 * Returns an error string if the Map contains non-string entries, null otherwise.
 * @param {unknown} payload
 * @returns {string|null} Error message, or null on success
 */
function normalizePayloadFrontier(payload) {
  if (!isPlainObject(payload)) {
    return null;
  }
  const p = /** @type {Record<string, unknown>} */ (payload);
  if (!(p['frontier'] instanceof Map)) {
    return null;
  }
  const normalized = normalizeFrontier(p['frontier']);
  if (normalized === null) {
    return 'Invalid frontier: Map contains non-string entries';
  }
  p['frontier'] = normalized;
  return null;
}

/**
 * Validates a sync request payload. Returns the parsed value or throws.
 *
 * Handles Map→object normalization for cbor-x compatibility.
 *
 * @param {unknown} payload - Raw parsed payload (from JSON.parse or cbor-x decode)
 * @param {SyncPayloadLimits} [limits] - Resource limits
 * @returns {{ ok: true, value: { type: 'sync-request', frontier: Record<string, string> } } | { ok: false, error: string }}
 */
export function validateSyncRequest(payload, limits = DEFAULT_LIMITS) {
  const frontierErr = normalizePayloadFrontier(payload);
  if (frontierErr !== null) {
    return { ok: false, error: frontierErr };
  }

  const schema = limits === DEFAULT_LIMITS ? SyncRequestSchema : createSyncRequestSchema(limits);
  const result = schema.safeParse(payload);
  if (!result.success) {
    return { ok: false, error: result.error.message };
  }
  /** @type {unknown} */
  const raw = result.data;
  const value = /** @type {{ type: 'sync-request', frontier: Record<string, string> }} */ (raw);
  return { ok: true, value };
}

/**
 * Validates a sync response payload. Returns the parsed value or an error.
 *
 * Handles Map→object normalization for cbor-x compatibility.
 *
 * @param {unknown} payload - Raw parsed payload
 * @param {SyncPayloadLimits} [limits] - Resource limits
 * @returns {{ ok: true, value: unknown } | { ok: false, error: string }}
 */
export function validateSyncResponse(payload, limits = DEFAULT_LIMITS) {
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
