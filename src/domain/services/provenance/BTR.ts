/**
 * Boundary Transition Record.
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

import BtrSigningEnvelope from './BtrSigningEnvelope.ts';
import BoundaryTransitionProvenance, { type PatchEntry } from './BoundaryTransitionProvenance.ts';

// -- Constants ----------------------------------------------------------------

const BTR_VERSION = 1;
const REQUIRED_FIELDS = ['version', 'h_in', 'h_out', 'U_0', 'P', 't', 'kappa'] as const;

// -- Types --------------------------------------------------------------------

type BTRFields = {
  readonly version: number;
  readonly h_in: string;
  readonly h_out: string;
  readonly U_0: Uint8Array;
  readonly P: BoundaryTransitionProvenance | readonly PatchEntry[];
  readonly t: string;
  readonly kappa: string;
};

class BoundaryTransitionRecord {
  readonly kappa: string;
  readonly #envelope: BtrSigningEnvelope;

  constructor(fields: BTRFields) {
    this.#envelope = new BtrSigningEnvelope({
      version: fields.version,
      h_in: fields.h_in,
      h_out: fields.h_out,
      U_0: fields.U_0,
      P: fields.P,
      t: fields.t,
    });
    this.kappa = fields.kappa;
    Object.freeze(this);
  }

  get version(): number {
    return this.#envelope.version;
  }

  get h_in(): string {
    return this.#envelope.h_in;
  }

  get h_out(): string {
    return this.#envelope.h_out;
  }

  get U_0(): Uint8Array {
    return this.#envelope.U_0;
  }

  get P(): readonly PatchEntry[] {
    return this.#envelope.P;
  }

  get t(): string {
    return this.#envelope.t;
  }

  get envelope(): BtrSigningEnvelope {
    return this.#envelope;
  }

  get provenance(): BoundaryTransitionProvenance {
    return this.#envelope.provenance;
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

function findMissingField(candidate: object): string | null {
  for (const field of REQUIRED_FIELDS) {
    if (!(field in candidate)) {
      return field;
    }
  }
  return null;
}

function validateBTRStructure(btr: BoundaryTransitionRecord): string | null {
  if (typeof btr !== 'object') {
    return 'BTR must be an object';
  }
  const missing = findMissingField(btr);
  if (missing !== null) {
    return `Missing required field: ${missing}`;
  }
  if (btr.version !== BTR_VERSION) {
    return `Unsupported BTR version: ${String(btr.version)} (expected ${BTR_VERSION})`;
  }
  return null;
}

const BTR = BoundaryTransitionRecord;

export {
  BoundaryTransitionRecord,
  BTR,
  VerificationResult,
  BTR_VERSION,
  REQUIRED_FIELDS,
  validateBTRStructure,
  findMissingField,
};
export default BoundaryTransitionRecord;
export type { BTRFields };
