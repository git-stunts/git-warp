/**
 * Shared internals for WARP message codecs.
 *
 * Trailer constants, text-message parsing, and validation helpers used by
 * PatchMessageCodec, CheckpointMessageCodec, AnchorMessageCodec,
 * AuditMessageCodec, and MessageSchemaDetector.
 *
 * Not public API — import from WarpMessageCodec or individual codecs.
 */

import MessageCodecError from '../../errors/MessageCodecError.ts';

// ── Constants ───────────────────────────────────────────────────────

export const MESSAGE_TITLES = Object.freeze({
  patch: 'warp:patch',
  checkpoint: 'warp:checkpoint',
  anchor: 'warp:anchor',
  audit: 'warp:audit',
});

export const TRAILER_KEYS = Object.freeze({
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
  storageVersion: 'eg-storage-version',
  storageSchema: 'eg-storage-schema',
  dataCommit: 'eg-data-commit',
  opsDigest: 'eg-ops-digest',
  encrypted: 'eg-encrypted',
});

export type TrailerKey = keyof typeof TRAILER_KEYS;

const OID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

// ── Text trailer messages ───────────────────────────────────────────

export type TrailerTextMessage = {
  readonly title: string;
  readonly trailers: Readonly<Record<string, string>>;
};

/** Encodes a title plus insertion-ordered trailer lines. */
export function encodeTrailerTextMessage(message: TrailerTextMessage): string {
  if (message.title.length === 0) {
    throw new MessageCodecError('Invalid trailer message: missing title', {
      code: 'E_MESSAGE_TITLE',
    });
  }
  assertTrailerTextSingleLine(message.title, 'title');
  const lines = [message.title, ''];
  for (const key of Object.keys(message.trailers)) {
    const value = message.trailers[key];
    if (value !== undefined) {
      assertTrailerTextSingleLine(key, 'trailer key');
      assertTrailerTextSingleLine(value, key);
      lines.push(`${key}: ${value}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function assertTrailerTextSingleLine(value: string, fieldName: string): void {
  if (/[\r\n]/.test(value)) {
    throw new MessageCodecError(`Invalid trailer message: ${fieldName} must be single-line`, {
      code: 'E_MESSAGE_TRAILER_LINE',
      context: { fieldName },
    });
  }
}

/** Decodes a title plus trailer lines into a transport message. */
export function decodeTrailerTextMessage(message: string): TrailerTextMessage {
  const lines = requireTrailerTextInput(message).replace(/\r\n/g, '\n').split('\n');
  const title = lines[0];
  if (title === undefined || title.length === 0) {
    throw new MessageCodecError('Invalid trailer message: missing title', {
      code: 'E_MESSAGE_TITLE',
    });
  }
  const separatorIndex = lines.indexOf('', 1);
  if (separatorIndex === -1) {
    return { title, trailers: Object.freeze({}) };
  }
  return {
    title,
    trailers: decodeTrailerLines(lines.slice(separatorIndex + 1)),
  };
}

function requireTrailerTextInput(message: string): string {
  if (typeof message !== 'string' || message.length === 0) {
    throw new MessageCodecError('Invalid trailer message: expected non-empty string', {
      code: 'E_MESSAGE_EMPTY',
    });
  }
  return message;
}

function decodeTrailerLines(lines: readonly string[]): Readonly<Record<string, string>> {
  const trailers: Record<string, string> = {};
  for (const line of lines) {
    if (line.length === 0) {
      continue;
    }
    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) {
      throw new MessageCodecError(`Invalid trailer line: ${line}`, {
        code: 'E_MESSAGE_TRAILER_LINE',
      });
    }
    const key = line.slice(0, separatorIndex);
    if (trailers[key] !== undefined) {
      throw new MessageCodecError(`Duplicate trailer rejected: ${key}`, {
        code: 'E_MESSAGE_DUPLICATE_TRAILER', context: { key },
      });
    }
    trailers[key] = decodeTrailerValue(line, separatorIndex);
  }
  return Object.freeze(trailers);
}

function decodeTrailerValue(line: string, separatorIndex: number): string {
  const value = line.slice(separatorIndex + 1);
  if (value.startsWith(' ')) {
    return value.slice(1);
  }
  return value;
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
