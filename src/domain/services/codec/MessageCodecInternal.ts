/**
 * Shared internals for WARP message codecs.
 *
 * Lazy TrailerCodec singleton, constants, and validation helpers
 * used by PatchMessageCodec, CheckpointMessageCodec,
 * AnchorMessageCodec, and MessageSchemaDetector.
 *
 * Not public API — import from WarpMessageCodec or individual codecs.
 */

// @ts-expect-error -- no declaration file for @git-stunts/trailer-codec
import { TrailerCodec, TrailerCodecService } from '@git-stunts/trailer-codec';
import MessageCodecError from '../../errors/MessageCodecError.ts';

// ── Constants ───────────────────────────────────────────────────────

export const MESSAGE_TITLES: Record<string, string> = {
  patch: 'warp:patch',
  checkpoint: 'warp:checkpoint',
  anchor: 'warp:anchor',
  audit: 'warp:audit',
};

export const TRAILER_KEYS: Record<string, string> = {
  kind: 'eg-kind',
  graph: 'eg-graph',
  writer: 'eg-writer',
  lamport: 'eg-lamport',
  patchOid: 'eg-patch-oid',
  stateHash: 'eg-state-hash',
  frontierOid: 'eg-frontier-oid',
  indexOid: 'eg-index-oid',
  schema: 'eg-schema',
  checkpointVersion: 'eg-checkpoint',
  dataCommit: 'eg-data-commit',
  opsDigest: 'eg-ops-digest',
  encrypted: 'eg-encrypted',
};

const OID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

// ── Codec instance ──────────────────────────────────────────────────

type TrailerCodecShape = {
  encode(msg: { title: string; trailers: Record<string, string> }): string;
  decode(msg: string): { trailers: Record<string, string> };
};

let _codec: TrailerCodecShape | null = null;

/** Returns the lazy singleton TrailerCodec instance. */
export function getCodec(): TrailerCodecShape {
  if (_codec !== null) {
    return _codec;
  }
  const TrailerCodecServiceCtor = TrailerCodecService as new () => unknown;
  const TrailerCodecCtor = TrailerCodec as new (opts: { service: unknown }) => TrailerCodecShape;
  const service: unknown = new TrailerCodecServiceCtor();
  _codec = new TrailerCodecCtor({ service });
  return _codec;
}

// ── Validation helpers ──────────────────────────────────────────────

/** Validates a Git OID (40 or 64 hex chars). */
export function validateOid(oid: string, fieldName: string): void {
  if (typeof oid !== 'string') {
    throw new MessageCodecError(`Invalid ${fieldName}: expected string, got ${typeof oid}`, {
      code: 'E_MESSAGE_OID_TYPE', context: { fieldName, actual: typeof oid },
    });
  }
  if (!OID_PATTERN.test(oid)) {
    throw new MessageCodecError(`Invalid ${fieldName}: must be a 40 or 64 character hex string, got '${oid}'`, {
      code: 'E_MESSAGE_OID_FORMAT', context: { fieldName, oid },
    });
  }
}

/** Validates a SHA-256 hash (64 hex chars). */
export function validateSha256(hash: string, fieldName: string): void {
  if (typeof hash !== 'string') {
    throw new MessageCodecError(`Invalid ${fieldName}: expected string, got ${typeof hash}`, {
      code: 'E_MESSAGE_SHA256_TYPE', context: { fieldName, actual: typeof hash },
    });
  }
  if (!SHA256_PATTERN.test(hash)) {
    throw new MessageCodecError(`Invalid ${fieldName}: must be a 64 character hex string, got '${hash}'`, {
      code: 'E_MESSAGE_SHA256_FORMAT', context: { fieldName, hash },
    });
  }
}

/** Validates a positive integer. */
export function validatePositiveInteger(value: number, fieldName: string): void {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new MessageCodecError(`Invalid ${fieldName}: must be a positive integer, got ${value}`, {
      code: 'E_MESSAGE_POSITIVE_INTEGER', context: { fieldName, value },
    });
  }
}

/** Validates a schema version. */
export function validateSchema(schema: number): void {
  validatePositiveInteger(schema, 'schema');
}
