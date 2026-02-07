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

import { createHmac, timingSafeEqual } from 'crypto';
import { encode, decode } from '../../infrastructure/codecs/CborCodec.js';
import { ProvenancePayload } from './ProvenancePayload.js';
import { serializeFullStateV5, deserializeFullStateV5, computeStateHashV5 } from './StateSerializerV5.js';

/**
 * HMAC algorithm used for authentication tags.
 * SHA-256 provides 256-bit security with wide hardware support.
 * @const {string}
 */
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
 * @param {Object} fields - BTR fields to authenticate
 * @param {number} fields.version - BTR format version
 * @param {string} fields.h_in - Hash of input state
 * @param {string} fields.h_out - Hash of output state
 * @param {Buffer} fields.U_0 - Serialized initial state
 * @param {Array} fields.P - Serialized provenance payload
 * @param {string} fields.t - ISO timestamp
 * @param {string|Buffer} key - HMAC key
 * @returns {string} Hex-encoded HMAC tag
 * @private
 */
function computeHmac(fields, key) {
  const message = encode({
    version: fields.version,
    h_in: fields.h_in,
    h_out: fields.h_out,
    U_0: fields.U_0,
    P: fields.P,
    t: fields.t,
  });

  const hmac = createHmac(HMAC_ALGORITHM, key);
  hmac.update(message);
  return hmac.digest('hex');
}

/**
 * @typedef {Object} BTR
 * @property {number} version - BTR format version
 * @property {string} h_in - Hash of input state (hex SHA-256)
 * @property {string} h_out - Hash of output state (hex SHA-256)
 * @property {Buffer} U_0 - Serialized initial state (CBOR)
 * @property {Array} P - Serialized provenance payload
 * @property {string} t - ISO 8601 timestamp
 * @property {string} kappa - Authentication tag (hex HMAC-SHA256)
 */

/**
 * @typedef {Object} VerificationResult
 * @property {boolean} valid - Whether the BTR is valid
 * @property {string} [reason] - Reason for failure (if invalid)
 */

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
 * @param {import('./JoinReducer.js').WarpStateV5} initialState - The input state U_0
 * @param {ProvenancePayload} payload - The provenance payload P
 * @param {Object} options - BTR creation options
 * @param {string|Buffer} options.key - HMAC key for authentication
 * @param {string} [options.timestamp] - ISO timestamp (defaults to now)
 * @returns {BTR} The created BTR
 * @throws {TypeError} If payload is not a ProvenancePayload
 */
export function createBTR(initialState, payload, options) {
  if (!(payload instanceof ProvenancePayload)) {
    throw new TypeError('payload must be a ProvenancePayload');
  }

  const { key, timestamp = new Date().toISOString() } = options;

  // Validate HMAC key is not empty/falsy
  if (!key || (typeof key === 'string' && key.length === 0) ||
      (Buffer.isBuffer(key) && key.length === 0)) {
    throw new Error('Invalid HMAC key: key must not be empty');
  }

  const h_in = computeStateHashV5(initialState);
  const U_0 = serializeFullStateV5(initialState);
  const finalState = payload.replay(initialState);
  const h_out = computeStateHashV5(finalState);
  const P = payload.toJSON();

  const fields = { version: BTR_VERSION, h_in, h_out, U_0, P, t: timestamp };
  const kappa = computeHmac(fields, key);

  return { ...fields, kappa };
}

const REQUIRED_FIELDS = ['version', 'h_in', 'h_out', 'U_0', 'P', 't', 'kappa'];

/**
 * Validates BTR structure and returns failure reason if invalid.
 *
 * @param {*} btr - The BTR object to validate
 * @returns {string|null} Error message if invalid, null if valid
 * @private
 */
function validateBTRStructure(btr) {
  if (!btr || typeof btr !== 'object') {
    return 'BTR must be an object';
  }
  for (const field of REQUIRED_FIELDS) {
    if (!(field in btr)) {
      return `Missing required field: ${field}`;
    }
  }
  if (btr.version !== BTR_VERSION) {
    return `Unsupported BTR version: ${btr.version} (expected ${BTR_VERSION})`;
  }
  return null;
}

/**
 * Verifies HMAC authentication tag using timing-safe comparison.
 *
 * @param {BTR} btr - The BTR to verify
 * @param {string|Buffer} key - HMAC key
 * @returns {boolean} True if the HMAC tag matches
 * @private
 */
function verifyHmac(btr, key) {
  const fields = {
    version: btr.version,
    h_in: btr.h_in,
    h_out: btr.h_out,
    U_0: btr.U_0,
    P: btr.P,
    t: btr.t,
  };
  const expectedKappa = computeHmac(fields, key);

  // Convert hex strings to buffers for timing-safe comparison
  const actualBuf = Buffer.from(btr.kappa, 'hex');
  const expectedBuf = Buffer.from(expectedKappa, 'hex');

  // Check lengths first to avoid timingSafeEqual throwing on length mismatch
  if (actualBuf.length !== expectedBuf.length) {
    return false;
  }

  return timingSafeEqual(actualBuf, expectedBuf);
}

/**
 * Verifies replay produces expected h_out.
 *
 * @param {BTR} btr - The BTR to verify
 * @returns {string|null} Error message if replay mismatch, null if valid
 * @private
 */
function verifyReplayHash(btr) {
  try {
    const result = replayBTR(btr);
    if (result.h_out !== btr.h_out) {
      return `Replay produced different h_out: expected ${btr.h_out}, got ${result.h_out}`;
    }
    return null;
  } catch (err) {
    return `Replay failed: ${err.message}`;
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
 * @param {string|Buffer} key - HMAC key
 * @param {Object} [options] - Verification options
 * @param {boolean} [options.verifyReplay=false] - Also verify replay produces h_out
 * @returns {VerificationResult} Verification result with valid flag and optional reason
 */
export function verifyBTR(btr, key, options = {}) {
  const structureError = validateBTRStructure(btr);
  if (structureError) {
    return { valid: false, reason: structureError };
  }

  if (!verifyHmac(btr, key)) {
    return { valid: false, reason: 'Authentication tag mismatch' };
  }

  if (options.verifyReplay) {
    const replayError = verifyReplayHash(btr);
    if (replayError) {
      return { valid: false, reason: replayError };
    }
  }

  return { valid: true };
}

/**
 * Replays a BTR to produce the final state.
 *
 * This implements the computational holography theorem: given the boundary
 * encoding (U_0, P), replay uniquely determines the interior worldline.
 *
 * @param {BTR} btr - The BTR to replay
 * @returns {{ state: import('./JoinReducer.js').WarpStateV5, h_out: string }}
 *   The final state and its hash
 * @throws {Error} If replay fails
 */
export function replayBTR(btr) {
  // Deserialize initial state from U_0
  // Note: U_0 is the full serialized state (via serializeFullStateV5)
  const initialState = deserializeInitialState(btr.U_0);

  // Reconstruct payload
  const payload = ProvenancePayload.fromJSON(btr.P);

  // Replay
  const finalState = payload.replay(initialState);

  // Compute h_out
  const h_out = computeStateHashV5(finalState);

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
 * @param {Buffer} U_0 - Serialized full state
 * @returns {import('./JoinReducer.js').WarpStateV5} The deserialized state
 * @private
 */
function deserializeInitialState(U_0) {
  return deserializeFullStateV5(U_0);
}

/**
 * Serializes a BTR to CBOR bytes for transport.
 *
 * The serialized form is deterministic (canonical CBOR encoding),
 * enabling byte-for-byte comparison of BTRs.
 *
 * @param {BTR} btr - The BTR to serialize
 * @returns {Buffer} CBOR-encoded BTR
 */
export function serializeBTR(btr) {
  return encode({
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
 * @param {Buffer} bytes - CBOR-encoded BTR
 * @returns {BTR} The deserialized BTR
 * @throws {Error} If the bytes are not valid CBOR or missing required fields
 */
export function deserializeBTR(bytes) {
  const obj = decode(bytes);

  // Validate structure (reuse module-level constant for consistency with validateBTRStructure)
  for (const field of REQUIRED_FIELDS) {
    if (!(field in obj)) {
      throw new Error(`Invalid BTR: missing field ${field}`);
    }
  }

  return {
    version: obj.version,
    h_in: obj.h_in,
    h_out: obj.h_out,
    U_0: obj.U_0,
    P: obj.P,
    t: obj.t,
    kappa: obj.kappa,
  };
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
