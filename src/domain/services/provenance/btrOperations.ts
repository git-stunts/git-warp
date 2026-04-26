/**
 * BTR operations: create, verify, and replay.
 *
 * Stateless functions operating on BTR instances. All crypto operations
 * go through the injected CryptoPort.
 *
 * @module domain/services/provenance/btrOperations
 * @see Paper III, Section 4
 */

import type CryptoPort from '../../../ports/CryptoPort.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type WarpState from '../state/WarpState.ts';
import defaultCodec from '../../utils/defaultCodec.ts';
import { hexEncode, hexDecode } from '../../utils/bytes.ts';
import CryptoError from '../../errors/CryptoError.ts';
import WarpError from '../../errors/WarpError.ts';
import { BTR, VerificationResult, BTR_VERSION, validateBTRStructure, type PatchEntryJSON } from './BTR.ts';
import { ProvenancePayload, type PatchEntry } from './ProvenancePayload.ts';
import { serializeFullState, deserializeFullState, computeStateHash } from '../state/StateSerializer.ts';

// -- Constants ----------------------------------------------------------------

const HMAC_ALGORITHM = 'sha256';

// -- Types --------------------------------------------------------------------

type CryptoDeps = {
  readonly crypto: CryptoPort;
  readonly codec?: CodecPort;
};

// -- HMAC computation ---------------------------------------------------------

async function computeHmac(
  fields: { version: number; h_in: string; h_out: string; U_0: Uint8Array; P: readonly Record<string, string | number | boolean | null | readonly Record<string, string | number | boolean | null>[]>[]; t: string },
  key: string | Uint8Array,
  deps: CryptoDeps,
): Promise<string> {
  const c = deps.codec ?? defaultCodec;
  const message = c.encode({
    version: fields.version,
    h_in: fields.h_in,
    h_out: fields.h_out,
    U_0: fields.U_0,
    P: fields.P,
    t: fields.t,
  });
  const rawHmac = await deps.crypto.hmac(HMAC_ALGORITHM, key, message);
  const bytes = rawHmac instanceof Uint8Array ? rawHmac : new Uint8Array(rawHmac);
  return hexEncode(bytes);
}

// -- Key validation -----------------------------------------------------------

function validateHmacKey(key: string | Uint8Array): void {
  if (typeof key === 'string' && key.length === 0) {
    throw new CryptoError('Invalid HMAC key: key must not be empty', { code: 'E_INVALID_HMAC_KEY' });
  }
  if (key instanceof Uint8Array && key.byteLength === 0) {
    throw new CryptoError('Invalid HMAC key: key must not be empty', { code: 'E_INVALID_HMAC_KEY' });
  }
}

// -- Create -------------------------------------------------------------------

/**
 * Creates a Boundary Transition Record from an initial state and payload.
 *
 * The BTR captures h_in, U_0, P, h_out (after replay), timestamp,
 * and an HMAC authentication tag covering all fields.
 */
async function createBTR(
  initialState: WarpState,
  payload: ProvenancePayload,
  opts: {
    key: string | Uint8Array;
    timestamp: string;
    crypto: CryptoPort;
    codec?: CodecPort;
  },
): Promise<BTR> {
  if (!(payload instanceof ProvenancePayload)) {
    throw new WarpError('payload must be a ProvenancePayload', 'E_BTR_INVALID_PAYLOAD');
  }

  validateHmacKey(opts.key);

  const { timestamp } = opts;
  const deps: CryptoDeps = opts.codec ? { crypto: opts.crypto, codec: opts.codec } : { crypto: opts.crypto };
  const codecOpt = opts.codec ? { codec: opts.codec } : {};

  const h_in = await computeStateHash(initialState, deps);
  const U_0 = serializeFullState(initialState, codecOpt);
  const finalState = payload.replay(initialState);
  const h_out = await computeStateHash(finalState, deps);
  // Codec boundary: PatchEntry objects are JSON-safe when codec-encoded
  const P = payload.toJSON() as unknown as readonly PatchEntryJSON[];

  const fields = { version: BTR_VERSION, h_in, h_out, U_0, P, t: timestamp };
  const kappa = await computeHmac(fields, opts.key, deps);

  return new BTR({ ...fields, kappa });
}

// -- Verify -------------------------------------------------------------------

/**
 * Verifies a Boundary Transition Record.
 *
 * 1. Structural validation (required fields, version)
 * 2. HMAC verification (timing-safe comparison)
 * 3. Optional replay verification (P from U_0 produces h_out)
 */
async function verifyBTR(
  btr: BTR,
  key: string | Uint8Array,
  opts: {
    verifyReplay?: boolean;
    crypto?: CryptoPort;
    codec?: CodecPort;
  } = {},
): Promise<VerificationResult> {
  const structError = validateBTRStructure(btr);
  if (structError !== null) {
    return new VerificationResult(false, structError);
  }

  if (opts.crypto === undefined) {
    return new VerificationResult(false, 'CryptoPort required for HMAC verification');
  }

  const deps: CryptoDeps = opts.codec !== undefined ? { crypto: opts.crypto, codec: opts.codec } : { crypto: opts.crypto };

  // HMAC verification
  let hmacValid: boolean;
  try {
    const expected = await computeHmac(
      { version: btr.version, h_in: btr.h_in, h_out: btr.h_out, U_0: btr.U_0, P: btr.P, t: btr.t },
      key,
      deps,
    );
    const actualBuf = hexDecode(btr.kappa);
    const expectedBuf = hexDecode(expected);
    if (actualBuf.length !== expectedBuf.length) {
      hmacValid = false;
    } else {
      hmacValid = deps.crypto.timingSafeEqual(actualBuf, expectedBuf);
    }
  } catch (err) {
    if (err instanceof RangeError) {
      return new VerificationResult(false, `Invalid hex in authentication tag: ${err.message}`);
    }
    throw err;
  }

  if (!hmacValid) {
    return new VerificationResult(false, 'Authentication tag mismatch');
  }

  // Optional replay verification
  if (opts.verifyReplay === true) {
    try {
      const result = await replayBTR(btr, deps);
      if (result.h_out !== btr.h_out) {
        return new VerificationResult(false, `Replay produced different h_out: expected ${btr.h_out}, got ${result.h_out}`);
      }
    } catch (err) {
      return new VerificationResult(false, `Replay failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return new VerificationResult(true);
}

// -- Replay -------------------------------------------------------------------

/**
 * Replays a BTR to produce the final state.
 *
 * Implements the computational holography theorem: given (U_0, P),
 * replay uniquely determines the interior worldline.
 */
async function replayBTR(
  btr: BTR,
  deps: { crypto?: CryptoPort; codec?: CodecPort } = {},
): Promise<{ state: WarpState; h_out: string }> {
  const codecOpt = deps.codec ? { codec: deps.codec } : {};
  const initialState = deserializeFullState(btr.U_0, codecOpt);
  // Codec boundary: PatchEntryJSON is the JSON-safe form of PatchEntry
  const payload = ProvenancePayload.fromJSON(btr.P as unknown as PatchEntry[]);
  const finalState = payload.replay(initialState);

  if (!deps.crypto) {
    throw new CryptoError('CryptoPort required for state hash', { code: 'E_MISSING_CRYPTO' });
  }
  const h_out = await computeStateHash(finalState, deps.codec ? { crypto: deps.crypto, codec: deps.codec } : { crypto: deps.crypto });
  return { state: finalState, h_out };
}

export { createBTR, verifyBTR, replayBTR };
