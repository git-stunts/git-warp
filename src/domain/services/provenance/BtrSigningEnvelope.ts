/**
 * Semantic BTR fields covered by HMAC.
 *
 * The envelope is not a wire DTO. It carries domain meaning and leaves
 * canonical byte production to the boundary codec adapter.
 */

import BoundaryTransitionProvenance, { type PatchEntry } from './BoundaryTransitionProvenance.ts';

type BtrSigningEnvelopeInput = {
  readonly version: number;
  readonly h_in: string;
  readonly h_out: string;
  readonly U_0: Uint8Array;
  readonly P: BoundaryTransitionProvenance | readonly PatchEntry[];
  readonly t: string;
};

export default class BtrSigningEnvelope {
  readonly version: number;
  readonly h_in: string;
  readonly h_out: string;
  readonly t: string;

  readonly #initialStateBytes: Uint8Array;
  readonly #provenance: BoundaryTransitionProvenance;

  constructor(input: BtrSigningEnvelopeInput) {
    this.version = input.version;
    this.h_in = input.h_in;
    this.h_out = input.h_out;
    this.#initialStateBytes = new Uint8Array(input.U_0);
    this.#provenance = input.P instanceof BoundaryTransitionProvenance
      ? input.P
      : new BoundaryTransitionProvenance(input.P);
    this.t = input.t;
    Object.freeze(this);
  }

  get U_0(): Uint8Array {
    return new Uint8Array(this.#initialStateBytes);
  }

  get P(): readonly PatchEntry[] {
    return this.#provenance.entries();
  }

  get provenance(): BoundaryTransitionProvenance {
    return this.#provenance;
  }
}

export { BtrSigningEnvelope };
export type { BtrSigningEnvelopeInput };
