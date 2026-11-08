/**
 * WriterId - CRDT-safe writer identity generation and resolution.
 *
 * Provides utilities for generating stable, globally unique writer IDs
 * that are safe for use in Git refs and CRDT version vectors.
 *
 * @module domain/utils/WriterId
 * @see WARP WriterId Spec v1
 */

import WarpError from '../errors/WarpError.ts';
import { drawEntropy } from './EntropyDraw.ts';
import { validateWriterId } from './RefLayout.ts';
import type RandomPort from '../../ports/RandomPort.ts';

/**
 * Typed error for WriterId generation and resolution failures.
 */
export class WriterIdError extends Error {
  readonly code: string;
  override readonly cause: Error | undefined;

  /**
   * Constructs a WriterIdError with a code and optional cause.
   */
  constructor(code: string, message: string, cause?: Error) {
    super(message);
    this.name = 'WriterIdError';
    this.code = code;
    this.cause = cause;
  }
}

// Crockford base32 alphabet (lowercase), excluding i,l,o,u
const CROCKFORD32 = '0123456789abcdefghjkmnpqrstvwxyz';

/**
 * Regex for canonical writer ID format.
 * - Prefix: w_
 * - Body: 26 chars Crockford Base32 (lowercase)
 * - Total length: 28 chars
 */
const CANONICAL_RE = /^w_[0-9a-hjkmnp-tv-z]{26}$/;

/**
 * Validates that a writer ID is in canonical format.
 *
 * Canonical format:
 * - Prefix: `w_`
 * - Body: 26 chars Crockford Base32 (lowercase)
 * - Total length: 28 chars
 *
 * @throws {WriterIdError} If the ID is not canonical
 *
 * @example
 * validateWriterIdCanonical('w_0123456789abcdefghjkmnpqrs'); // OK
 * validateWriterIdCanonical('alice'); // throws INVALID_CANONICAL
 */
export function validateWriterIdCanonical(id: string): void {
  if (typeof id !== 'string') {
    throw new WriterIdError('INVALID_TYPE', 'writerId must be a string');
  }
  if (!CANONICAL_RE.test(id)) {
    throw new WriterIdError('INVALID_CANONICAL', `writerId is not canonical: ${id}`);
  }
}

/** Entropy behind one canonical writer id: 128 bits. */
const WRITER_ID_ENTROPY_BYTES = 16;

/**
 * Encodes bytes as Crockford Base32 (lowercase).
 */
function crockfordBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';

  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      const idx = (value >>> (bits - 5)) & 31;
      out += CROCKFORD32[idx];
      bits -= 5;
    }
  }

  if (bits > 0) {
    const idx = (value << (5 - bits)) & 31;
    out += CROCKFORD32[idx];
  }

  return out;
}

/**
 * Generates a new canonical writer ID from injected entropy.
 *
 * Draws 128 bits (16 bytes) from `random` and encodes them as Crockford
 * Base32. The result is prefixed with `w_` for a total length of 28
 * characters. The same entropy always yields the same id.
 *
 * @throws {EntropyError} If the port does not return exactly 16 bytes
 *
 * @example
 * const id = generateWriterId(random);
 * // => 'w_abc123...' (26 chars after prefix)
 */
export function generateWriterId(random: RandomPort): string {
  const bytes = drawEntropy(random, WRITER_ID_ENTROPY_BYTES);
  return `w_${crockfordBase32(bytes)}`;
}

interface ResolveWriterIdArgs {
  readonly random: RandomPort;
  readonly graphName: string;
  readonly explicitWriterId: string | null | undefined;
  readonly configGet: (key: string) => Promise<string | null>;
  readonly configSet: (key: string, value: string) => Promise<void>;
}

/**
 * Resolves a writer ID with repo-local persistence.
 *
 * Resolution order:
 * 1. If `explicitWriterId` is provided, validate (ref-safe) and return it
 * 2. Load from git config key `warp.writerId.<graphName>`
 * 3. If missing or invalid, generate new canonical ID, persist, and return
 *
 * @throws {WriterIdError} If config operations fail
 *
 * @example
 * const writerId = await resolveWriterId({
 *   random,
 *   graphName: 'events',
 *   explicitWriterId: undefined,
 *   configGet: async (key) => git.config.get(key),
 *   configSet: async (key, val) => git.config.set(key, val),
 * });
 */
export async function resolveWriterId({ random, graphName, explicitWriterId, configGet, configSet }: ResolveWriterIdArgs): Promise<string> {
  if (explicitWriterId !== null && explicitWriterId !== undefined) {
    assertOrdinaryWriterId(explicitWriterId);
    return explicitWriterId;
  }

  const key = `warp.writerId.${graphName}`;
  const fromConfig = await loadFromConfig(configGet, key);
  if (fromConfig !== null) {
    return fromConfig;
  }

  return await generateAndPersist(configSet, key, random);
}

/**
 * Attempts to load and validate a writer ID from git config.
 * Returns the ID if valid, or null if missing/invalid.
 */
async function loadFromConfig(configGet: (key: string) => Promise<string | null>, key: string): Promise<string | null> {
  const existing = await readConfigKey(configGet, key);
  if (existing === null || existing === undefined || existing === '') {
    return null;
  }
  return tryValidateWriterId(existing) ? existing : null;
}

/**
 * Reads a config key, wrapping errors as WriterIdError.
 */
async function readConfigKey(configGet: (key: string) => Promise<string | null>, key: string): Promise<string | null> {
  try {
    return await configGet(key);
  } catch (e) {
    throw new WriterIdError('CONFIG_READ_FAILED', `Failed to read git config key ${key}`, e instanceof Error ? e : undefined);
  }
}

/**
 * Returns true if the writer ID passes ref-safe validation, false otherwise.
 */
function tryValidateWriterId(id: string): boolean {
  try {
    validateWriterId(id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generates a fresh writer ID and persists it to config.
 */
async function generateAndPersist(
  configSet: (key: string, value: string) => Promise<void>,
  key: string,
  random: RandomPort,
): Promise<string> {
  const fresh = generateWriterId(random);
  validateWriterId(fresh);
  validateWriterIdCanonical(fresh);

  try {
    await configSet(key, fresh);
  } catch (e) {
    throw new WriterIdError('CONFIG_WRITE_FAILED', `Failed to persist writerId to git config key ${key}`, e instanceof Error ? e : undefined);
  }

  return fresh;
}

/** Writer ids under this prefix belong to duplicate-dot repairs (#1022). */
export const REPAIR_WRITER_PREFIX = 'repair.';

/**
 * Validates a writer id a caller chose. `repair.<writer>` ids are reserved
 * for the repair that derives them, so ordinary writes never mint repair dots.
 */
export function assertOrdinaryWriterId(writerId: string): void {
  validateWriterId(writerId);
  if (writerId.startsWith(REPAIR_WRITER_PREFIX)) {
    throw new WarpError(`Writer id '${writerId}' is reserved for duplicate-dot repairs`, 'E_WRITER_ID_RESERVED', {
      context: { writerId },
    });
  }
}
