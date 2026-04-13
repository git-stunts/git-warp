/**
 * Trust V1 Zod schemas.
 *
 * Schemas for trust record envelope, per-type subjects, policy config,
 * and assessment output contract. These are the canonical validation
 * boundary -- all trust data passes through these schemas.
 *
 * @module domain/trust/schemas
 * @see docs/specs/TRUST_V1_CRYPTO.md Sections 8-10, 14
 */

import { z } from 'zod';

// -- Primitives ---------------------------------------------------------------

const KeyIdSchema = z.string().regex(
  /^ed25519:[a-f0-9]{64}$/,
  'keyId must be "ed25519:" followed by 64 hex chars',
);

const RecordIdSchema = z.string().regex(
  /^[a-f0-9]{64}$/,
  'recordId must be 64 lowercase hex chars',
);

const RecordTypeSchema = z.enum([
  'KEY_ADD',
  'KEY_REVOKE',
  'WRITER_BIND_ADD',
  'WRITER_BIND_REVOKE',
]);

// -- Signature ----------------------------------------------------------------

const TrustSignatureSchema = z.object({
  alg: z.literal('ed25519'),
  sig: z.string().min(1, 'signature must not be empty'),
});

// -- Per-type subject schemas -------------------------------------------------

const KeyAddSubjectSchema = z.object({
  keyId: KeyIdSchema,
  publicKey: z.string().min(1, 'publicKey must not be empty'),
});

const KeyRevokeSubjectSchema = z.object({
  keyId: KeyIdSchema,
  reasonCode: z.enum(['KEY_COMPROMISE', 'KEY_ROLLOVER', 'OPERATOR_REQUEST']),
});

const WriterBindAddSubjectSchema = z.object({
  writerId: z.string().trim().min(1),
  keyId: KeyIdSchema,
});

const WriterBindRevokeSubjectSchema = z.object({
  writerId: z.string().trim().min(1),
  keyId: KeyIdSchema,
  reasonCode: z.enum(['ACCESS_REMOVED', 'ROTATION', 'KEY_REVOKED']),
});

// -- Subject dispatch map (DRY: one lookup, not four identical functions) ------

type RecordType = z.infer<typeof RecordTypeSchema>;

const SUBJECT_SCHEMAS: Record<RecordType, z.ZodTypeAny> = {
  KEY_ADD: KeyAddSubjectSchema,
  KEY_REVOKE: KeyRevokeSubjectSchema,
  WRITER_BIND_ADD: WriterBindAddSubjectSchema,
  WRITER_BIND_REVOKE: WriterBindRevokeSubjectSchema,
};

// -- Trust record envelope ----------------------------------------------------

const TrustRecordSchema = z.object({
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
  const schema = SUBJECT_SCHEMAS[record.recordType];
  const result = schema.safeParse(record.subject);
  if (!result.success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Invalid ${record.recordType} subject: ${result.error.message}`,
    });
  } else {
    record.subject = result.data as Record<string, unknown>;
  }
});

// -- Policy config ------------------------------------------------------------

const TrustPolicySchema = z.object({
  schemaVersion: z.literal(1),
  mode: z.enum(['warn', 'enforce']),
  writerPolicy: z.literal('all_writers_must_be_trusted'),
});

// -- Assessment output contract -----------------------------------------------

const TrustExplanationSchema = z.object({
  writerId: z.string().min(1),
  trusted: z.boolean(),
  reasonCode: z.string().min(1),
  reason: z.string().min(1),
});

const EvidenceSummarySchema = z.object({
  recordsScanned: z.number().int().nonnegative(),
  activeKeys: z.number().int().nonnegative(),
  revokedKeys: z.number().int().nonnegative(),
  activeBindings: z.number().int().nonnegative(),
  revokedBindings: z.number().int().nonnegative(),
});

const TrustAssessmentSchema = z.object({
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

// -- Inferred subject types (runtime truth via Zod) ---------------------------

type KeyAddSubject = z.infer<typeof KeyAddSubjectSchema>;
type KeyRevokeSubject = z.infer<typeof KeyRevokeSubjectSchema>;
type WriterBindAddSubject = z.infer<typeof WriterBindAddSubjectSchema>;
type WriterBindRevokeSubject = z.infer<typeof WriterBindRevokeSubjectSchema>;
type TrustSignature = z.infer<typeof TrustSignatureSchema>;
type TrustPolicy = z.infer<typeof TrustPolicySchema>;
type TrustExplanation = z.infer<typeof TrustExplanationSchema>;
type EvidenceSummary = z.infer<typeof EvidenceSummarySchema>;

export {
  KeyIdSchema,
  RecordIdSchema,
  RecordTypeSchema,
  TrustSignatureSchema,
  KeyAddSubjectSchema,
  KeyRevokeSubjectSchema,
  WriterBindAddSubjectSchema,
  WriterBindRevokeSubjectSchema,
  TrustRecordSchema,
  TrustPolicySchema,
  TrustExplanationSchema,
  EvidenceSummarySchema,
  TrustAssessmentSchema,
};
export type {
  RecordType,
  KeyAddSubject,
  KeyRevokeSubject,
  WriterBindAddSubject,
  WriterBindRevokeSubject,
  TrustSignature,
  TrustPolicy,
  TrustExplanation,
  EvidenceSummary,
};
