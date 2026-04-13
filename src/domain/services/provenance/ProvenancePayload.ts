/**
 * ProvenancePayload - Transferable Provenance as a Monoid
 *
 * Implements the provenance payload from Paper III (Computational Holography):
 * P = (mu_0, ..., mu_{n-1}) - an ordered sequence of tick patches.
 *
 * @module domain/services/provenance/ProvenancePayload
 */

import { reduceV5, createEmptyState, cloneState, type WarpState } from '../JoinReducer.ts';
import WarpError from '../../errors/WarpError.ts';
import type Patch from '../../types/Patch.ts';

export interface PatchEntry {
  patch: Patch;
  sha: string;
}

class ProvenancePayload {
  readonly #patches: ReadonlyArray<PatchEntry>;

  constructor(patches: PatchEntry[] = []) {
    if (!Array.isArray(patches)) {
      throw new WarpError(
        'ProvenancePayload requires an array of patches',
        'E_PROVENANCE_PAYLOAD_INVALID',
      );
    }
    this.#patches = Object.freeze([...patches]);
    Object.freeze(this);
  }

  static identity(): ProvenancePayload {
    return new ProvenancePayload([]);
  }

  get length(): number {
    return this.#patches.length;
  }

  concat(other: ProvenancePayload): ProvenancePayload {
    if (!(other instanceof ProvenancePayload)) {
      throw new WarpError(
        'concat requires a ProvenancePayload',
        'E_PROVENANCE_PAYLOAD_CONCAT',
      );
    }
    if (this.#patches.length === 0) { return other; }
    if (other.#patches.length === 0) { return this; }
    return new ProvenancePayload([...this.#patches, ...other.#patches]);
  }

  replay(initialState?: WarpState): WarpState {
    if (this.#patches.length === 0) {
      return initialState ? cloneState(initialState) : createEmptyState();
    }
    return reduceV5([...this.#patches], initialState) as WarpState;
  }

  [Symbol.iterator](): Iterator<PatchEntry> {
    return this.#patches[Symbol.iterator]();
  }

  at(index: number): PatchEntry | undefined {
    return this.#patches.at(index);
  }

  slice(start = 0, end: number = this.#patches.length): ProvenancePayload {
    const sliced = this.#patches.slice(start, end);
    return new ProvenancePayload([...sliced]);
  }

  toJSON(): PatchEntry[] {
    return [...this.#patches];
  }

  static fromJSON(json: PatchEntry[]): ProvenancePayload {
    return new ProvenancePayload(json);
  }
}

export default ProvenancePayload;
export { ProvenancePayload };
