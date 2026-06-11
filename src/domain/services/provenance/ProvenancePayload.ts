/**
 * ProvenancePayload - Transferable Provenance as a Monoid
 *
 * Implements the provenance payload from Paper III (Computational Holography):
 * P = (mu_0, ..., mu_{n-1}) - an ordered sequence of tick patches.
 *
 * @module domain/services/provenance/ProvenancePayload
 */

import { reducePatches, createEmptyState, cloneState, type WarpState } from '../JoinReducer.ts';
import WarpError from '../../errors/WarpError.ts';
import BoundaryTransitionProvenance, { type PatchEntry } from './BoundaryTransitionProvenance.ts';

class ProvenancePayload {
  readonly #provenance: BoundaryTransitionProvenance;

  constructor(patches: readonly PatchEntry[] = []) {
    if (!Array.isArray(patches)) {
      throw new WarpError(
        'ProvenancePayload requires an array of patches',
        'E_PROVENANCE_PAYLOAD_INVALID',
      );
    }
    this.#provenance = new BoundaryTransitionProvenance(patches);
    Object.freeze(this);
  }

  static identity(): ProvenancePayload {
    return new ProvenancePayload([]);
  }

  get length(): number {
    return this.#provenance.length;
  }

  concat(other: ProvenancePayload): ProvenancePayload {
    if (!(other instanceof ProvenancePayload)) {
      throw new WarpError(
        'concat requires a ProvenancePayload',
        'E_PROVENANCE_PAYLOAD_CONCAT',
      );
    }
    if (this.#provenance.length === 0) { return other; }
    if (other.#provenance.length === 0) { return this; }
    return new ProvenancePayload([...this.#provenance, ...other.#provenance]);
  }

  replay(initialState?: WarpState): WarpState {
    if (this.#provenance.length === 0) {
      return initialState ? cloneState(initialState) : createEmptyState();
    }
    return reducePatches(this.#provenance.entries(), initialState);
  }

  [Symbol.iterator](): Iterator<PatchEntry> {
    return this.#provenance[Symbol.iterator]();
  }

  at(index: number): PatchEntry | undefined {
    return this.#provenance.at(index);
  }

  slice(start = 0, end: number = this.#provenance.length): ProvenancePayload {
    return new ProvenancePayload(this.#provenance.entries().slice(start, end));
  }

  entries(): PatchEntry[] {
    return this.#provenance.entries();
  }

  get provenance(): BoundaryTransitionProvenance {
    return this.#provenance;
  }

  static fromEntries(entries: readonly PatchEntry[]): ProvenancePayload {
    return new ProvenancePayload(entries);
  }
}

export default ProvenancePayload;
export { ProvenancePayload };
export type { PatchEntry };
