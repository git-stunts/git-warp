/**
 * Trust V1 Zod schemas.
 *
 * Schemas for trust record envelope, per-type subjects, policy config,
 * and assessment output contract. These are the canonical validation
 * boundary — all trust data passes through these schemas.
 *
 * @module domain/trust/schemas
 * @see docs/specs/TRUST_V1_CRYPTO.md Sections 8–10, 14
 */

import { z } from 'zod';

// ── Primitives ──────────────────────────────────────────────────────────

export const KeyIdSchema = z.string().regex(
  /^ed25519:[a-f0-9]{64}$/,
  'keyId must be "ed25519:" followed by 64 hex chars',
);

export const RecordIdSchema = z.string().regex(
  /^[a-f0-9]{64}$/,
  'recordId must be 64 lowercase hex chars',
);

export const RecordTypeSchema = z.enum([
  'KEY_ADD',
  'KEY_REVOKE',
  'WRITER_BIND_ADD',
  'WRITER_BIND_REVOKE',
]);

// ── Signature ───────────────────────────────────────────────────────────

export const TrustSignatureSchema = z.object({
  alg: z.literal('ed25519'),
  sig: z.string().min(1, 'signature must not be empty'),
});

// ── Per-type subject schemas ────────────────────────────────────────────

export const KeyAddSubjectSchema = z.object({
  keyId: KeyIdSchema,
  publicKey: z.string().min(1, 'publicKey must not be empty'),
});

export const KeyRevokeSubjectSchema = z.object({
  keyId: KeyIdSchema,
  reasonCode: z.enum(['KEY_COMPROMISE', 'KEY_ROLLOVER', 'OPERATOR_REQUEST']),
});

export const WriterBindAddSubjectSchema = z.object({
  writerId: z.string().trim().min(1),
  keyId: KeyIdSchema,
});

export const WriterBindRevokeSubjectSchema = z.object({
  writerId: z.string().trim().min(1),
  keyId: KeyIdSchema,
  reasonCode: z.enum(['ACCESS_REMOVED', 'ROTATION', 'KEY_REVOKED']),
});

// ── Trust record envelope ───────────────────────────────────────────────

export const TrustRecordSchema = z.object({
  schemaVersion: z.literal(1),
  recordType: RecordTypeSchema,
  recordId: RecordIdSchema,
  issuerKeyId: KeyIdSchema,
  issuedAt: z.string().datetime({ offset: false }),
  prev: RecordIdSchema.nullable(),
  subject: z.record(z.unknown()),
  meta: z.record(z.unknown()).optional().default({}),
  signature: TrustSignatureSchema,
}).superRefine((record, ctx) => {
  /** @param {string} message */
  const addIssue = (message) =>
    ctx.addIssue({ code: z.ZodIssueCode.custom, message });

  switch (record.recordType) {
    case 'KEY_ADD': {
      const r = KeyAddSubjectSchema.safeParse(record.subject);
      if (!r.success) {
        addIssue(`Invalid KEY_ADD subject: ${r.error.message}`);
      } else {
        record.subject = r.data;
      }
      break;
    }
    case 'KEY_REVOKE': {
      const r = KeyRevokeSubjectSchema.safeParse(record.subject);
      if (!r.success) {
        addIssue(`Invalid KEY_REVOKE subject: ${r.error.message}`);
      } else {
        record.subject = r.data;
      }
      break;
    }
    case 'WRITER_BIND_ADD': {
      const r = WriterBindAddSubjectSchema.safeParse(record.subject);
      if (!r.success) {
        addIssue(`Invalid WRITER_BIND_ADD subject: ${r.error.message}`);
      } else {
        record.subject = r.data;
      }
      break;
    }
    case 'WRITER_BIND_REVOKE': {
      const r = WriterBindRevokeSubjectSchema.safeParse(record.subject);
      if (!r.success) {
        addIssue(`Invalid WRITER_BIND_REVOKE subject: ${r.error.message}`);
      } else {
        record.subject = r.data;
      }
      break;
    }
    default:
      addIssue(`Unsupported recordType: ${/** @type {string} */ (record.recordType)}`);
  }
});

// ── Policy config ───────────────────────────────────────────────────────

export const TrustPolicySchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(['warn', 'enforce']),
  writerPolicy: z.literal('all_writers_must_be_trusted'),
});

// ── Assessment output contract ──────────────────────────────────────────

export const TrustExplanationSchema = z.object({
  writerId: z.string().min(1),
  trusted: z.boolean(),
  reasonCode: z.string().min(1),
  reason: z.string().min(1),
});

export const EvidenceSummarySchema = z.object({
  recordsScanned: z.number().int().nonnegative(),
  activeKeys: z.number().int().nonnegative(),
  revokedKeys: z.number().int().nonnegative(),
  activeBindings: z.number().int().nonnegative(),
  revokedBindings: z.number().int().nonnegative(),
});

export const TrustAssessmentSchema = z.object({
  trustSchemaVersion: z.literal(1),
  mode: z.literal('signed_evidence_v1'),
  trustVerdict: z.enum(['pass', 'fail', 'not_configured']),
  trust: z.object({
    status: z.enum(['configured', 'pinned', 'error', 'not_configured']),
    source: z.enum(['ref', 'cli_pin', 'env_pin', 'none']),
    sourceDetail: z.string().nullable(),
    evaluatedWriters: z.array(z.string()),
    untrustedWriters: z.array(z.string()),
    explanations: z.array(TrustExplanationSchema),
    evidenceSummary: EvidenceSummarySchema,
  }),
});
