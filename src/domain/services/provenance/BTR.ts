/**
 * BTR — Boundary Transition Record.
 *
 * Tamper-evident provenance package binding initial state, provenance
 * payload, and output state hash. Implements the Boundary Transition
 * Records from Paper III (Computational Holography).
 *
 * A BTR binds (h_in, h_out, U_0, P, t, kappa):
 * - h_in: hash of input state
 * - h_out: hash of output state (after replay)
 * - U_0: initial state snapshot (serialized)
 * - P: provenance payload
 * - t: timestamp
 * - kappa: authentication tag (HMAC)
 *
 * @module domain/services/provenance/BTR
 * @see Paper III, Section 4
 */

import type CodecPort from '../../../ports/CodecPort.ts';
import defaultCodec from '../../utils/defaultCodec.ts';
import CryptoError from '../../errors/CryptoError.ts';

// -- Constants ----------------------------------------------------------------

const BTR_VERSION = 1;
const REQUIRED_FIELDS = ['version', 'h_in', 'h_out', 'U_0', 'P', 't', 'kappa'] as const;

// -- Types --------------------------------------------------------------------

type BTRFields = {
  readonly version: number;
  readonly h_in: string;
  readonly h_out: string;
  readonly U_0: Uint8Array;
  readonly P: readonly PatchEntryJSON[];
  readonly t: string;
  readonly kappa: string;
};

/** JSON-safe patch entry as stored in the provenance payload. */
type PatchEntryJSON = Record<string, string | number | boolean | null | readonly Record<string, string | number | boolean | null>[]>;

// -- BTR class ----------------------------------------------------------------

class BTR {
  readonly version: number;
  readonly h_in: string;
  readonly h_out: string;
  readonly U_0: Uint8Array;
  readonly P: readonly PatchEntryJSON[];
  readonly t: string;
  readonly kappa: string;

  constructor(fields: BTRFields) {
    this.version = fields.version;
    this.h_in = fields.h_in;
    this.h_out = fields.h_out;
    this.U_0 = fields.U_0;
    this.P = fields.P;
    this.t = fields.t;
    this.kappa = fields.kappa;
    Object.freeze(this);
  }

  /**
   * Serializes to CBOR bytes.
   *
   * NOTE: CBOR encoding in domain code is a known boundary violation.
   * Kept here for backward compat. Will move to adapter.
   */
  serialize(codec?: CodecPort): Uint8Array {
    const c = codec ?? defaultCodec;
    return c.encode({
      version: this.version,
      h_in: this.h_in,
      h_out: this.h_out,
      U_0: this.U_0,
      P: this.P,
      t: this.t,
      kappa: this.kappa,
    });
  }

  /**
   * Deserializes from CBOR bytes.
   * Same boundary violation note as serialize().
   */
  static deserialize(bytes: Uint8Array, codec?: CodecPort): BTR {
    const c = codec ?? defaultCodec;
    const obj = c.decode(bytes) as Record<string, string | number | Uint8Array | PatchEntryJSON[]>;
    const missing = findMissingField(obj);
    if (missing !== null) {
      throw new CryptoError(`Invalid BTR: missing field ${missing}`, { code: 'E_BTR_INVALID' });
    }
    // Adapter boundary: validated by findMissingField above
    return new BTR(obj as unknown as BTRFields);
  }
}

// -- VerificationResult -------------------------------------------------------

class VerificationResult {
  readonly valid: boolean;
  readonly reason: string | undefined;

  constructor(valid: boolean, reason?: string) {
    this.valid = valid;
    this.reason = reason;
  }
}

// -- Validation helpers -------------------------------------------------------

function findMissingField(rec: Record<string, string | number | Uint8Array | PatchEntryJSON[]>): string | null {
  for (const field of REQUIRED_FIELDS) {
    if (!(field in rec)) {
      return field;
    }
  }
  return null;
}

function validateBTRStructure(btr: BTR): string | null {
  if (typeof btr !== 'object') {
    return 'BTR must be an object';
  }
  const missing = findMissingField(btr as unknown as Record<string, string | number | Uint8Array | PatchEntryJSON[]>);
  if (missing !== null) {
    return `Missing required field: ${missing}`;
  }
  if (btr.version !== BTR_VERSION) {
    return `Unsupported BTR version: ${String(btr.version)} (expected ${BTR_VERSION})`;
  }
  return null;
}

export { BTR, VerificationResult, BTR_VERSION, REQUIRED_FIELDS, validateBTRStructure, findMissingField };
export type { BTRFields, PatchEntryJSON };
