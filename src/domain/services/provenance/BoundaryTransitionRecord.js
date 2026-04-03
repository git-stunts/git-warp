/**
 * BoundaryTransitionRecord (BTR) - Tamper-Evident Provenance Packaging
 *
 * Implements Boundary Transition Records from Paper III (Computational Holography).
 *
 * A BTR binds (h_in, h_out, U_0, P, t, kappa):
 * - h_in: hash of input state
 * - h_out: hash of output state (after replay)
 * - U_0: initial state snapshot (serialized)
 * - P: provenance payload
 * - t: timestamp
 * - kappa: authentication tag (HMAC)
 *
 * BTRs enable tamper-evident exchange of graph segments between parties
 * who don't share full history. The HMAC ensures integrity; replay
 * verification ensures correctness.
 *
 * @module domain/services/BoundaryTransitionRecord
 * @see Paper III, Section 4 -- Boundary Transition Records
 */

import defaultCodec from '../../utils/defaultCodec.js';
import CryptoError from '../../errors/CryptoError.js';
import { ProvenancePayload } from './ProvenancePayload.js';
import { serializeFullStateV5, deserializeFullStateV5, computeStateHashV5 } from '../state/StateSerializerV5.js';

/**
 * Converts a Uint8Array to a hex string.
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function uint8ArrayToHex(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += (bytes[i] ?? 0).toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Converts a hex string to a Uint8Array.
 * @param {string} hex
 * @returns {Uint8Array}
 */
function hexToUint8Array(hex) {
  if (typeof hex !== 'string' || hex.length % 2 !== 0) {
    throw new RangeError(`Invalid hex string (length ${typeof hex === 'string' ? hex.length : 'N/A'})`);
  }
  return parseHexPairs(hex);
}

/**
 * Parses hex string pairs into a Uint8Array.
 * @param {string} hex - A validated even-length hex string
 * @returns {Uint8Array}
 */
function parseHexPairs(hex) {
  const HEX_PAIR_STEP = 2;
  const bytes = new Uint8Array(hex.length / HEX_PAIR_STEP);
  for (let i = 0; i < hex.length; i += HEX_PAIR_STEP) {
    const byte = parseInt(hex.substring(i, i + HEX_PAIR_STEP), 16);
    if (Number.isNaN(byte)) {
      throw new RangeError(`Invalid hex byte at offset ${i}: ${hex.substring(i, i + HEX_PAIR_STEP)}`);
    }
    bytes[i / HEX_PAIR_STEP] = byte;
  }
  return bytes;
}

/**
 * HMAC algorithm used for authentication tags.
 * SHA-256 provides 256-bit security with wide hardware support.
 * @const {string}
 */
/**
 * Builds a deps object including only defined values.
 * Avoids explicit `undefined` in optional properties under exactOptionalPropertyTypes.
 *
 * @param {{ crypto?: import('../../../ports/CryptoPort.js').default|null|undefined, codec?: import('../../../ports/CodecPort.js').default|null|undefined }} parts
 * @returns {{ crypto?: import('../../../ports/CryptoPort.js').default, codec?: import('../../../ports/CodecPort.js').default }}
 */
function buildDeps(parts) {
  /** @type {{ crypto?: import('../../../ports/CryptoPort.js').default, codec?: import('../../../ports/CodecPort.js').default }} */
  const deps = {};
  if (parts.crypto !== undefined && parts.crypto !== null) { deps.crypto = parts.crypto; }
  if (parts.codec !== undefined && parts.codec !== null) { deps.codec = parts.codec; }
  return deps;
}

const HMAC_ALGORITHM = 'sha256';

/**
 * BTR format version for future compatibility.
 * @const {number}
 */
const BTR_VERSION = 1;

/**
 * Computes HMAC authentication tag over BTR fields.
 *
 * The tag is computed over the canonical CBOR encoding of:
 * (version, h_in, h_out, U_0, P, t)
 *
 * This ensures all fields are covered and the encoding is deterministic.
 *
 * @param {{ version: number, h_in: string, h_out: string, U_0: Uint8Array, P: Array<unknown>, t: string }} fields - BTR fields to authenticate
 * @param {string|Uint8Array} key - HMAC key
 * @param {{ crypto: import('../../../ports/CryptoPort.js').default, codec?: import('../../../ports/CodecPort.js').default }} deps - Dependencies
 * @returns {Promise<string>} Hex-encoded HMAC tag
 * @private
 */
async function computeHmac(fields, key, { crypto, codec }) {
  const c = codec || defaultCodec;
  const message = c.encode({
    version: fields.version,
    h_in: fields.h_in,
    h_out: fields.h_out,
    U_0: fields.U_0,
    P: fields.P,
    t: fields.t,
  });

  const rawHmac = await crypto.hmac(HMAC_ALGORITHM, key, message);
  const bytes = rawHmac instanceof Uint8Array ? rawHmac : new Uint8Array(rawHmac);
  return uint8ArrayToHex(bytes);
}

/**
 * BTR — Boundary Transition Record. Tamper-evident package binding
 * initial state, provenance payload, and output state hash.
 */
export class BTR {
  /** @type {string} Hash of input state (hex SHA-256) */
  h_in;

  /** @type {string} Hash of output state (hex SHA-256) */
  h_out;

  /** @type {string} Authentication tag (hex HMAC-SHA256) */
  kappa;

  /** @type {Array<unknown>} Serialized provenance payload */
  P;

  /** @type {string} ISO 8601 timestamp */
  t;

  /** @type {Uint8Array} Serialized initial state (CBOR) */
  U_0;

  /** @type {number} BTR format version */
  version;

  /**
   * Creates a BTR from field values.
   * @param {{ version: number, h_in: string, h_out: string, U_0: Uint8Array, P: Array<unknown>, t: string, kappa: string }} fields
   */
  constructor({ version, h_in, h_out, U_0, P, t, kappa }) {
    this.version = version;
    this.h_in = h_in;
    this.h_out = h_out;
    this.U_0 = U_0;
    this.P = P;
    this.t = t;
    this.kappa = kappa;
    Object.freeze(this);
  }
}

/**
 * VerificationResult — outcome of BTR HMAC/replay verification.
 */
export class VerificationResult {
  /** @type {boolean} */
  valid;

  /** @type {string|undefined} Reason for failure (if invalid) */
  reason;

  /**
   * Creates a VerificationResult.
   * @param {boolean} valid
   * @param {string} [reason]
   */
  constructor(valid, reason) {
    this.valid = valid;
    if (reason !== undefined) {
      this.reason = reason;
    }
  }
}

/**
 * Creates a Boundary Transition Record from an initial state and payload.
 *
 * The BTR captures:
 * 1. The hash of the initial state (h_in)
 * 2. The provenance payload for replay
 * 3. The hash of the final state after replay (h_out)
 * 4. A timestamp
 * 5. An HMAC authentication tag covering all fields
 *
 * ## Security Properties
 *
 * - **Integrity**: The HMAC tag detects any modification to any field
 * - **Authenticity**: Only holders of the key can create valid BTRs
 * - **Non-repudiation**: The BTR binds h_in → h_out via the payload
 *
 * ## Example
 *
 * ```javascript
 * const initialState = createEmptyStateV5();
 * const payload = new ProvenancePayload([...patches]);
 * const key = 'secret-key';
 *
 * const btr = createBTR(initialState, payload, { key });
 * // btr.h_in, btr.h_out, btr.kappa are all set
 * ```
 *
 * @param {import('../JoinReducer.js').WarpStateV5} initialState - The input state U_0
 * @param {ProvenancePayload} payload - The provenance payload P
 * @param {{ key: string|Uint8Array, timestamp?: string, crypto: import('../../../ports/CryptoPort.js').default, codec?: import('../../../ports/CodecPort.js').default }} options - BTR creation options
 * @returns {Promise<BTR>} The created BTR
 * @throws {TypeError} If payload is not a ProvenancePayload
 */
export async function createBTR(initialState, payload, options) {
  if (!(payload instanceof ProvenancePayload)) {
    throw new TypeError('payload must be a ProvenancePayload');
  }

  // eslint-disable-next-line no-restricted-syntax -- wall-clock default for BTR timestamp
  const { key, timestamp = new Date().toISOString(), crypto, codec } = options;

  validateHmacKey(key);

  const deps = buildDeps({ crypto, codec });
  const codecDeps = buildDeps({ codec });

  const h_in = await computeStateHashV5(initialState, /** @type {{ crypto: import('../../../ports/CryptoPort.js').default, codec?: import('../../../ports/CodecPort.js').default }} */ (deps));
  const U_0 = serializeFullStateV5(initialState, codecDeps);
  const finalState = payload.replay(initialState);
  const h_out = await computeStateHashV5(finalState, /** @type {{ crypto: import('../../../ports/CryptoPort.js').default, codec?: import('../../../ports/CodecPort.js').default }} */ (deps));
  const P = payload.toJSON();

  const fields = { version: BTR_VERSION, h_in, h_out, U_0, P, t: timestamp };
  const kappa = await computeHmac(fields, key, /** @type {{ crypto: import('../../../ports/CryptoPort.js').default, codec?: import('../../../ports/CodecPort.js').default }} */ (deps));

  return new BTR({ ...fields, kappa });
}

/**
 * Validates that an HMAC key is non-empty.
 * @param {string|Uint8Array} key - The HMAC key to validate
 * @throws {Error} If the key is empty or falsy
 */
function validateHmacKey(key) {
  if (isHmacKeyEmpty(key)) {
    throw new CryptoError('Invalid HMAC key: key must not be empty', { code: 'E_INVALID_HMAC_KEY' });
  }
}

/**
 * Checks whether an HMAC key is empty or falsy.
 *
 * @param {string|Uint8Array|null|undefined} key
 * @returns {boolean}
 */
function isHmacKeyEmpty(key) {
  if (key === null || key === undefined) {
    return true;
  }
  if (typeof key === 'string') {
    return key.length === 0;
  }
  return ArrayBuffer.isView(key) && key.byteLength === 0;
}

const REQUIRED_FIELDS = ['version', 'h_in', 'h_out', 'U_0', 'P', 't', 'kappa'];

/**
 * Validates BTR structure and returns failure reason if invalid.
 *
 * @param {unknown} btr - The BTR object to validate
 * @returns {string|null} Error message if invalid, null if valid
 * @private
 */
function validateBTRStructure(btr) {
  if (btr === null || btr === undefined || typeof btr !== 'object') {
    return 'BTR must be an object';
  }
  return validateBTRFields(/** @type {Record<string, unknown>} */ (btr));
}

/**
 * Validates required fields and version on a BTR record.
 *
 * @param {Record<string, unknown>} rec
 * @returns {string|null} Error message if invalid, null if valid
 */
function validateBTRFields(rec) {
  const missingField = findMissingField(rec);
  if (missingField !== null) {
    return `Missing required field: ${missingField}`;
  }
  const recVersion = /** @type {{ version?: unknown }} */ (rec).version;
  if (recVersion !== BTR_VERSION) {
    return `Unsupported BTR version: ${String(recVersion)} (expected ${BTR_VERSION})`;
  }
  return null;
}

/**
 * Finds the first missing required field in a BTR record.
 * @param {Record<string, unknown>} rec
 * @returns {string|null} The missing field name, or null if all present
 */
function findMissingField(rec) {
  for (const field of REQUIRED_FIELDS) {
    if (!(field in rec)) {
      return field;
    }
  }
  return null;
}

/**
 * Verifies HMAC authentication tag using timing-safe comparison.
 *
 * @param {BTR} btr - The BTR to verify
 * @param {string|Uint8Array} key - HMAC key
 * @param {{ crypto: import('../../../ports/CryptoPort.js').default, codec?: import('../../../ports/CodecPort.js').default }} deps - Dependencies
 * @returns {Promise<boolean>} True if the HMAC tag matches
 * @private
 */
async function verifyHmac(btr, key, { crypto, codec }) {
  const fields = {
    version: btr.version,
    h_in: btr.h_in,
    h_out: btr.h_out,
    U_0: btr.U_0,
    P: btr.P,
    t: btr.t,
  };
  const expectedKappa = await computeHmac(fields, key, /** @type {{ crypto: import('../../../ports/CryptoPort.js').default, codec?: import('../../../ports/CodecPort.js').default }} */ (buildDeps({ crypto, codec })));

  // Convert hex strings to byte arrays for timing-safe comparison
  const actualBuf = hexToUint8Array(btr.kappa);
  const expectedBuf = hexToUint8Array(expectedKappa);

  // Check lengths first to avoid timingSafeEqual throwing on length mismatch
  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

/**
 * Verifies replay produces expected h_out.
 *
 * @param {BTR} btr - The BTR to verify
 * @param {{ crypto?: import('../../../ports/CryptoPort.js').default, codec?: import('../../../ports/CodecPort.js').default }} [deps] - Dependencies
 * @returns {Promise<string|null>} Error message if replay mismatch, null if valid
 * @private
 */
async function verifyReplayHash(btr, deps = {}) {
  try {
    const result = await replayBTR(btr, deps);
    if (result.h_out !== btr.h_out) {
      return `Replay produced different h_out: expected ${btr.h_out}, got ${result.h_out}`;
    }
    return null;
  } catch (err) {
    return `Replay failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/**
 * Verifies a Boundary Transition Record.
 *
 * Verification checks:
 * 1. **HMAC verification**: The authentication tag matches
 * 2. **Replay verification** (optional): Replaying P from U_0 produces h_out
 *
 * The HMAC check is fast (O(1) relative to BTR size). Replay verification
 * is O(|P|) and optional for performance-sensitive scenarios.
 *
 * @param {BTR} btr - The BTR to verify
 * @param {string|Uint8Array} key - HMAC key
 * @param {{ verifyReplay?: boolean, crypto?: import('../../../ports/CryptoPort.js').default, codec?: import('../../../ports/CodecPort.js').default }} [options] - Verification options
 * @returns {Promise<VerificationResult>} Verification result with valid flag and optional reason
 */
export async function verifyBTR(btr, key, options = {}) {
  const structureError = validateBTRStructure(btr);
  if (structureError !== null) {
    return new VerificationResult(false, structureError);
  }

  const hmacDeps = /** @type {{ crypto: import('../../../ports/CryptoPort.js').default, codec?: import('../../../ports/CodecPort.js').default }} */ (buildDeps({ crypto: options.crypto, codec: options.codec }));
  const hmacResult = await verifyHmacSafe(btr, key, hmacDeps);
  if (hmacResult !== null) {
    return hmacResult;
  }

  return await verifyReplayIfRequested(btr, options);
}

/**
 * Optionally verifies replay produces the expected h_out.
 *
 * @param {BTR} btr
 * @param {{ verifyReplay?: boolean, crypto?: import('../../../ports/CryptoPort.js').default, codec?: import('../../../ports/CodecPort.js').default }} options
 * @returns {Promise<VerificationResult>}
 */
async function verifyReplayIfRequested(btr, options) {
  if (options.verifyReplay === true) {
    const replayDeps = buildDeps({ crypto: options.crypto, codec: options.codec });
    const replayError = await verifyReplayHash(btr, replayDeps);
    if (replayError !== null) {
      return new VerificationResult(false, replayError);
    }
  }
  return new VerificationResult(true);
}

/**
 * Wraps verifyHmac with error handling, returning a failure result or null on success.
 * @param {BTR} btr
 * @param {string|Uint8Array} key
 * @param {{ crypto: import('../../../ports/CryptoPort.js').default, codec?: import('../../../ports/CodecPort.js').default }} deps
 * @returns {Promise<VerificationResult|null>} Failure result, or null if HMAC is valid
 */
async function verifyHmacSafe(btr, key, deps) {
  /** @type {boolean} */
  let hmacValid;
  try {
    hmacValid = await verifyHmac(btr, key, deps);
  } catch (err) {
    if (err instanceof RangeError) {
      return new VerificationResult(false, `Invalid hex in authentication tag: ${err.message}`);
    }
    throw err;
  }
  if (!hmacValid) {
    return new VerificationResult(false, 'Authentication tag mismatch');
  }
  return null;
}

/**
 * Replays a BTR to produce the final state.
 *
 * This implements the computational holography theorem: given the boundary
 * encoding (U_0, P), replay uniquely determines the interior worldline.
 *
 * @param {BTR} btr - The BTR to replay
 * @param {{ crypto?: import('../../../ports/CryptoPort.js').default, codec?: import('../../../ports/CodecPort.js').default }} deps - Dependencies
 * @returns {Promise<{ state: import('../JoinReducer.js').WarpStateV5, h_out: string }>}
 *   The final state and its hash
 * @throws {Error} If replay fails
 */
export async function replayBTR(btr, deps = {}) {
  const { crypto, codec } = deps;
  // Deserialize initial state from U_0
  // Note: U_0 is the full serialized state (via serializeFullStateV5)
  const codecDeps = buildDeps({ codec });
  const initialState = deserializeInitialState(btr.U_0, codecDeps);

  // Reconstruct payload
  const payload = ProvenancePayload.fromJSON(/** @type {import('./ProvenancePayload.js').PatchEntry[]} */ (btr.P));

  // Replay
  const finalState = payload.replay(initialState);

  // Compute h_out
  const allDeps = /** @type {{ crypto: import('../../../ports/CryptoPort.js').default, codec?: import('../../../ports/CodecPort.js').default }} */ (buildDeps({ crypto, codec }));
  const h_out = await computeStateHashV5(finalState, allDeps);

  return { state: finalState, h_out };
}

/**
 * Deserializes the initial state from the U_0 field.
 *
 * The U_0 field contains the complete WarpStateV5 serialized via
 * serializeFullStateV5, including full CRDT internals (ORSet entries,
 * tombstones, LWW registers, version vectors).
 *
 * This ensures replay starts from the exact initial state, producing
 * the correct h_out hash.
 *
 * @param {Uint8Array} U_0 - Serialized full state
 * @param {{ codec?: import('../../../ports/CodecPort.js').default }} deps
 * @returns {import('../JoinReducer.js').WarpStateV5} The deserialized state
 * @private
 */
function deserializeInitialState(U_0, deps = {}) {
  return deserializeFullStateV5(U_0, deps);
}

/**
 * Serializes a BTR to CBOR bytes for transport.
 *
 * The serialized form is deterministic (canonical CBOR encoding),
 * enabling byte-for-byte comparison of BTRs.
 *
 * @param {BTR} btr - The BTR to serialize
 * @param {{ codec?: import('../../../ports/CodecPort.js').default }} [options]
 * @returns {Uint8Array} CBOR-encoded BTR
 */
export function serializeBTR(btr, { codec } = {}) {
  const c = codec || defaultCodec;
  return c.encode({
    version: btr.version,
    h_in: btr.h_in,
    h_out: btr.h_out,
    U_0: btr.U_0,
    P: btr.P,
    t: btr.t,
    kappa: btr.kappa,
  });
}

/**
 * Deserializes a BTR from CBOR bytes.
 *
 * @param {Uint8Array} bytes - CBOR-encoded BTR
 * @param {{ codec?: import('../../../ports/CodecPort.js').default }} [options]
 * @returns {BTR} The deserialized BTR
 * @throws {Error} If the bytes are not valid CBOR or missing required fields
 */
export function deserializeBTR(bytes, { codec } = {}) {
  const c = codec || defaultCodec;
  const obj = /** @type {Record<string, unknown>} */ (c.decode(bytes));

  const missingField = findMissingField(obj);
  if (missingField !== null) {
    throw new CryptoError(`Invalid BTR: missing field ${missingField}`, { code: 'E_BTR_INVALID' });
  }

  const typed = /** @type {{ version: number, h_in: string, h_out: string, U_0: Uint8Array, P: Array<unknown>, t: string, kappa: string }} */ (obj);
  return new BTR(typed);
}

/**
 * Gets the initial state hash from a BTR without full deserialization.
 *
 * @param {BTR} btr - The BTR
 * @returns {string} The h_in hash
 */
export function getBTRInputHash(btr) {
  return btr.h_in;
}

/**
 * Gets the output state hash from a BTR without replay.
 *
 * @param {BTR} btr - The BTR
 * @returns {string} The h_out hash
 */
export function getBTROutputHash(btr) {
  return btr.h_out;
}

/**
 * Gets the timestamp from a BTR.
 *
 * @param {BTR} btr - The BTR
 * @returns {string} ISO 8601 timestamp
 */
export function getBTRTimestamp(btr) {
  return btr.t;
}

/**
 * Gets the payload length (number of patches) from a BTR.
 *
 * @param {BTR} btr - The BTR
 * @returns {number} Number of patches in the payload
 */
export function getBTRPayloadLength(btr) {
  return Array.isArray(btr.P) ? btr.P.length : 0;
}

/**
 * Default export with all BTR functions.
 */
export default {
  createBTR,
  verifyBTR,
  replayBTR,
  serializeBTR,
  deserializeBTR,
  getBTRInputHash,
  getBTROutputHash,
  getBTRTimestamp,
  getBTRPayloadLength,
};
