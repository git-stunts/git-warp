/**
 * Trust V1 reason code registry.
 *
 * Every trust explanation MUST include a reasonCode from this registry.
 * Codes are stable — renaming or removing a code is a breaking change
 * that requires a spec version bump.
 *
 * @module domain/trust/reasonCodes
 * @see docs/specs/TRUST_V1_CRYPTO.md Section 15
 */

/** @type {Readonly<Record<string, string>>} */
export const TRUST_REASON_CODES = Object.freeze({
  // ── Positive ────────────────────────────────────────────────────────────
  /** Writer has at least one active binding to an active key. */
  WRITER_BOUND_TO_ACTIVE_KEY: 'WRITER_BOUND_TO_ACTIVE_KEY',

  // ── Negative ────────────────────────────────────────────────────────────
  /** Writer has no active bindings. */
  WRITER_HAS_NO_ACTIVE_BINDING: 'WRITER_HAS_NO_ACTIVE_BINDING',
  /** Writer's binding references a revoked key. */
  WRITER_BOUND_KEY_REVOKED: 'WRITER_BOUND_KEY_REVOKED',
  /** Writer's binding has been explicitly revoked. */
  BINDING_REVOKED: 'BINDING_REVOKED',
  /** Binding references a keyId not found in record log. */
  KEY_UNKNOWN: 'KEY_UNKNOWN',

  // ── System ──────────────────────────────────────────────────────────────
  /** Trust record ref does not exist. */
  TRUST_REF_MISSING: 'TRUST_REF_MISSING',
  /** Pinned commit does not exist or is invalid. */
  TRUST_PIN_INVALID: 'TRUST_PIN_INVALID',
  /** Record fails schema validation. */
  TRUST_RECORD_SCHEMA_INVALID: 'TRUST_RECORD_SCHEMA_INVALID',
  /** Record signature verification failed. */
  TRUST_SIGNATURE_INVALID: 'TRUST_SIGNATURE_INVALID',
  /** Record chain linking is broken. */
  TRUST_RECORD_CHAIN_INVALID: 'TRUST_RECORD_CHAIN_INVALID',
  /** Policy value is unknown or unsupported. */
  TRUST_POLICY_INVALID: 'TRUST_POLICY_INVALID',
});

/** @type {ReadonlySet<string>} */
export const POSITIVE_CODES = Object.freeze(new Set([
  TRUST_REASON_CODES.WRITER_BOUND_TO_ACTIVE_KEY,
]));

/** @type {ReadonlySet<string>} */
export const NEGATIVE_CODES = Object.freeze(new Set([
  TRUST_REASON_CODES.WRITER_HAS_NO_ACTIVE_BINDING,
  TRUST_REASON_CODES.WRITER_BOUND_KEY_REVOKED,
  TRUST_REASON_CODES.BINDING_REVOKED,
  TRUST_REASON_CODES.KEY_UNKNOWN,
]));

/** @type {ReadonlySet<string>} */
export const SYSTEM_CODES = Object.freeze(new Set([
  TRUST_REASON_CODES.TRUST_REF_MISSING,
  TRUST_REASON_CODES.TRUST_PIN_INVALID,
  TRUST_REASON_CODES.TRUST_RECORD_SCHEMA_INVALID,
  TRUST_REASON_CODES.TRUST_SIGNATURE_INVALID,
  TRUST_REASON_CODES.TRUST_RECORD_CHAIN_INVALID,
  TRUST_REASON_CODES.TRUST_POLICY_INVALID,
]));
