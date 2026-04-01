/**
 * WriterId - CRDT-safe writer identity generation and resolution.
 *
 * Provides utilities for generating stable, globally unique writer IDs
 * that are safe for use in Git refs and CRDT version vectors.
 *
 * @module domain/utils/WriterId
 * @see WARP WriterId Spec v1
 */

import { validateWriterId } from './RefLayout.js';

/**
 * Typed error for WriterId generation and resolution failures.
 */
export class WriterIdError extends Error {
  /**
   * Constructs a WriterIdError with a code and optional cause.
   * @param {string} code - Error code (e.g., 'CSPRNG_UNAVAILABLE')
   * @param {string} message - Human-readable error message
   * @param {Error} [cause] - Original error that caused this error
   */
  constructor(code, message, cause) {
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
 * @param {string} id - The writer ID to validate
 * @returns {void}
 * @throws {WriterIdError} If the ID is not canonical
 *
 * @example
 * validateWriterIdCanonical('w_0123456789abcdefghjkmnpqrs'); // OK
 * validateWriterIdCanonical('alice'); // throws INVALID_CANONICAL
 */
export function validateWriterIdCanonical(id) {
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
 * @param {number} n - Number of bytes to generate
 * @returns {Uint8Array} Random bytes
 * @throws {WriterIdError} If no secure random generator is available
 * @private
 */
function defaultRandomBytes(n) {
  if (typeof globalThis?.crypto?.getRandomValues === 'function') {
    const out = new Uint8Array(n);
    globalThis.crypto.getRandomValues(out);
    return out;
  }
  throw new WriterIdError('CSPRNG_UNAVAILABLE', 'No secure random generator available');
}

/**
 * Encodes bytes as Crockford Base32 (lowercase).
 *
 * @param {Uint8Array} bytes - Bytes to encode
 * @returns {string} Base32-encoded string
 * @private
 */
function crockfordBase32(bytes) {
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
 * @param {{ randomBytes?: (n: number) => Uint8Array }} [options] - Options with optional custom RNG for testing
 * @returns {string} A canonical writer ID (e.g., 'w_0123456789abcdefghjkmnpqrs')
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
export function generateWriterId({ randomBytes } = {}) {
  const rb = randomBytes ?? defaultRandomBytes;
  const bytes = rb(16); // 128-bit

  if (!(bytes instanceof Uint8Array) || bytes.length !== 16) {
    throw new WriterIdError('CSPRNG_UNAVAILABLE', 'randomBytes() must return Uint8Array(16)');
  }

  return `w_${crockfordBase32(bytes).toLowerCase()}`;
}

/**
 * Resolves a writer ID with repo-local persistence.
 *
 * Resolution order:
 * 1. If `explicitWriterId` is provided, validate (ref-safe) and return it
 * 2. Load from git config key `warp.writerId.<graphName>`
 * 3. If missing or invalid, generate new canonical ID, persist, and return
 *
 * @param {{ graphName: string, explicitWriterId: string|null|undefined, configGet: (key: string) => Promise<string|null>, configSet: (key: string, value: string) => Promise<void> }} args
 * @returns {Promise<string>} The resolved writer ID
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
export async function resolveWriterId({ graphName, explicitWriterId, configGet, configSet }) {
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
 * @param {(key: string) => Promise<string|null>} configGet
 * @param {string} key
 * @returns {Promise<string | null>}
 */
async function loadFromConfig(configGet, key) {
  const existing = await readConfigKey(configGet, key);
  if (existing === null || existing === undefined || existing === '') {
    return null;
  }
  return tryValidateWriterId(existing) ? existing : null;
}

/**
 * Reads a config key, wrapping errors as WriterIdError.
 * @param {(key: string) => Promise<string|null>} configGet
 * @param {string} key
 * @returns {Promise<string|null>}
 */
async function readConfigKey(configGet, key) {
  try {
    return await configGet(key);
  } catch (e) {
    throw new WriterIdError('CONFIG_READ_FAILED', `Failed to read git config key ${key}`, /** @type {Error|undefined} */ (e));
  }
}

/**
 * Returns true if the writer ID passes ref-safe validation, false otherwise.
 * @param {string} id
 * @returns {boolean}
 */
function tryValidateWriterId(id) {
  try {
    validateWriterId(id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generates a fresh writer ID and persists it to config.
 * @param {(key: string, value: string) => Promise<void>} configSet
 * @param {string} key
 * @returns {Promise<string>}
 */
async function generateAndPersist(configSet, key) {
  const fresh = generateWriterId();
  validateWriterId(fresh);
  validateWriterIdCanonical(fresh);

  try {
    await configSet(key, fresh);
  } catch (e) {
    throw new WriterIdError('CONFIG_WRITE_FAILED', `Failed to persist writerId to git config key ${key}`, /** @type {Error|undefined} */ (e));
  }

  return fresh;
}
