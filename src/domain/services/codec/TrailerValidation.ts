/**
 * Shared trailer validation helpers for WARP message codecs.
 *
 * Extracted from AnchorMessageCodec, AuditMessageCodec,
 * CheckpointMessageCodec, and PatchMessageCodec.
 */

import { TRAILER_KEYS, type TrailerKey } from './MessageCodecInternal.ts';
import MessageCodecError from '../../errors/MessageCodecError.ts';

const KEYS = TRAILER_KEYS;

/** Asserts a required trailer field is present and returns its value. */
export function requireTrailer(trailers: Record<string, string>, key: TrailerKey, kind: string): string {
  const trailerName = KEYS[key];
  const value = trailers[trailerName];
  if (typeof value !== 'string' || value.length === 0) {
    throw new MessageCodecError(`Invalid ${kind} message: missing required trailer ${trailerName}`, { code: 'E_MISSING_TRAILER' });
  }
  return value;
}

/** Parses a trailer value as a positive integer. */
export function parsePositiveIntTrailer(trailers: Record<string, string>, key: TrailerKey, kind: string): number {
  const str = requireTrailer(trailers, key, kind);
  const trailerName = KEYS[key];
  if (!/^\d+$/.test(str)) {
    throw new MessageCodecError(`Invalid ${kind} message: ${trailerName} must be a positive integer, got '${str}'`, { code: 'E_INVALID_TRAILER' });
  }
  const num = Number(str);
  if (!Number.isInteger(num) || num < 1) {
    throw new MessageCodecError(`Invalid ${kind} message: ${trailerName} must be a positive integer, got '${str}'`, { code: 'E_INVALID_TRAILER' });
  }
  return num;
}

/** Validates the eg-kind discriminator trailer matches the expected kind. */
export function validateKindDiscriminator(trailers: Record<string, string>, expected: string): void {
  const kind = trailers[KEYS.kind];
  if (kind !== expected) {
    const kindLabel = kind ?? 'missing';
    throw new MessageCodecError(`Invalid ${expected} message: eg-kind must be '${expected}', got '${kindLabel}'`, { code: 'E_WRONG_KIND' });
  }
}
