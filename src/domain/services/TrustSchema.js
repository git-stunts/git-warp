/**
 * TrustSchema — Zod schema and helpers for trust.json v1 configuration.
 *
 * Trust configuration is stored as a content-addressed Git blob
 * at `refs/warp/<graph>/trust/root`. This module defines the schema,
 * normalization, and canonical digest computation.
 *
 * @module domain/services/TrustSchema
 */

import { z } from 'zod';
import { canonicalStringify } from '../utils/canonicalJson.js';
import TrustError from '../errors/TrustError.js';

// ============================================================================
// Constants
// ============================================================================

/**
 * Domain-separated prefix for trust digest computation.
 * @type {string}
 */
export const TRUST_DIGEST_PREFIX = 'git-warp:trust:v1\0';

/**
 * Supported trust policies.
 * @type {readonly string[]}
 */
export const SUPPORTED_POLICIES = /** @type {const} */ (['any', 'all_writers_must_be_trusted']);

/**
 * Reserved trust policies (not yet implemented).
 * @type {readonly string[]}
 */
export const RESERVED_POLICIES = /** @type {const} */ (['allowlist_with_exceptions']);

// ============================================================================
// Schema
// ============================================================================

/**
 * Zod schema for trust.json v1.
 *
 * Writer list normalization: trim, reject empty entries, dedupe, sort.
 * Done once at parse boundary, never re-sorted downstream.
 */
export const trustConfigSchema = z.object({
  version: z.literal(1),
  trustedWriters: z.array(z.string().transform((s) => s.trim()))
    .transform((arr) => {
      const filtered = arr.filter((s) => s.length > 0);
      return [...new Set(filtered)].sort();
    }),
  policy: z.string(),
  epoch: z.string().min(1, 'epoch must be a non-empty ISO-8601 string')
    .refine((s) => !Number.isNaN(Date.parse(s)), 'epoch must be a valid ISO-8601 date string'),
  requiredSignatures: z.number().int().nonnegative().nullable(),
  allowedSignersPath: z.string().nullable(),
}).strict();

/** @typedef {z.infer<typeof trustConfigSchema>} TrustConfig */

// ============================================================================
// Validation
// ============================================================================

/**
 * Parses and validates a trust config object.
 *
 * @param {unknown} raw - Raw object to validate
 * @returns {TrustConfig} Validated and normalized config
 * @throws {TrustError} E_TRUST_SCHEMA_INVALID on validation failure
 * @throws {TrustError} E_TRUST_POLICY_RESERVED on reserved policy
 */
export function parseTrustConfig(raw) {
  const result = trustConfigSchema.safeParse(raw);
  if (!result.success) {
    const msg = result.error.issues.map((i) => i.message).join('; ');
    throw new TrustError(`Trust schema invalid: ${msg}`, {
      code: 'E_TRUST_SCHEMA_INVALID',
    });
  }

  const config = result.data;

  if (RESERVED_POLICIES.includes(config.policy)) {
    throw new TrustError(
      `Policy "${config.policy}" is reserved for a future release and not yet implemented`,
      { code: 'E_TRUST_POLICY_RESERVED', context: { policy: config.policy } },
    );
  }

  if (!SUPPORTED_POLICIES.includes(config.policy)) {
    throw new TrustError(`Unknown policy: ${config.policy}`, {
      code: 'E_TRUST_SCHEMA_INVALID',
      context: { policy: config.policy },
    });
  }

  return config;
}

// ============================================================================
// Canonicalization
// ============================================================================

/**
 * Produces a canonical JSON string for a trust config.
 * Key order is deterministic (sorted alphabetically at every level).
 *
 * @param {TrustConfig} config
 * @returns {string}
 */
export function canonicalizeTrustConfig(config) {
  return canonicalStringify(config);
}

/**
 * Computes the SHA-256 digest of a canonical trust config.
 * Domain-separated: `"git-warp:trust:v1\0" + canonicalJson`.
 *
 * @param {string} canonicalJson - Output of canonicalizeTrustConfig()
 * @param {import('../../ports/CryptoPort.js').default} crypto - Crypto adapter
 * @returns {Promise<string>} Hex-encoded SHA-256 digest
 */
export async function computeTrustDigest(canonicalJson, crypto) {
  const textEncoder = new TextEncoder();
  const prefixBytes = textEncoder.encode(TRUST_DIGEST_PREFIX);
  const jsonBytes = textEncoder.encode(canonicalJson);
  const combined = new Uint8Array(prefixBytes.length + jsonBytes.length);
  combined.set(prefixBytes, 0);
  combined.set(jsonBytes, prefixBytes.length);
  return await crypto.hash('sha256', combined);
}
