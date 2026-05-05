/**
 * WriterId - CRDT-safe writer identity generation and resolution.
 *
 * Provides utilities for generating stable, globally unique writer IDs
 * that are safe for use in Git refs and CRDT version vectors.
 *
 * @module domain/utils/WriterId
 * @see WARP WriterId Spec v1
 */

import { validateWriterId } from './RefLayout.ts';

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

/**
 * Default random bytes generator using Web Crypto API.
 *
 * @throws {WriterIdError} If no secure random generator is available
 */
function defaultRandomBytes(n: number): Uint8Array {
  if (typeof globalThis?.crypto?.getRandomValues === 'function') {
    const out = new Uint8Array(n);
    globalThis.crypto.getRandomValues(out);
    return out;
  }
  throw new WriterIdError('CSPRNG_UNAVAILABLE', 'No secure random generator available');
}

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
 * Generates a new canonical writer ID.
 *
 * Uses 128 bits of entropy (16 bytes) encoded as Crockford Base32.
 * The result is prefixed with `w_` for a total length of 28 characters.
 *
 * @throws {WriterIdError} If RNG is unavailable or returns wrong shape
 *
 * @example
 * const id = generateWriterId();
 * // => 'w_abc123...' (26 random chars after prefix)
 *
 * @example
 * // With custom RNG for deterministic testing
 * const id = generateWriterId({ randomBytes: mySeededRng });
 */
export function generateWriterId(options?: { randomBytes?: (n: number) => Uint8Array }): string {
  const rb = options?.randomBytes ?? defaultRandomBytes;
  const bytes = rb(16); // 128-bit

  if (!(bytes instanceof Uint8Array) || bytes.length !== 16) {
    throw new WriterIdError('CSPRNG_UNAVAILABLE', 'randomBytes() must return Uint8Array(16)');
  }

  return `w_${crockfordBase32(bytes).toLowerCase()}`;
}

interface ResolveWriterIdArgs {
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
 *   graphName: 'events',
 *   explicitWriterId: undefined,
 *   configGet: async (key) => git.config.get(key),
 *   configSet: async (key, val) => git.config.set(key, val),
 * });
 */
export async function resolveWriterId({ graphName, explicitWriterId, configGet, configSet }: ResolveWriterIdArgs): Promise<string> {
  if (explicitWriterId !== null && explicitWriterId !== undefined) {
    validateWriterId(explicitWriterId);
    return explicitWriterId;
  }

  const key = `warp.writerId.${graphName}`;
  const fromConfig = await loadFromConfig(configGet, key);
  if (fromConfig !== null) {
    return fromConfig;
  }

  return await generateAndPersist(configSet, key);
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
async function generateAndPersist(configSet: (key: string, value: string) => Promise<void>, key: string): Promise<string> {
  const fresh = generateWriterId();
  validateWriterId(fresh);
  validateWriterIdCanonical(fresh);

  try {
    await configSet(key, fresh);
  } catch (e) {
    throw new WriterIdError('CONFIG_WRITE_FAILED', `Failed to persist writerId to git config key ${key}`, e instanceof Error ? e : undefined);
  }

  return fresh;
}
