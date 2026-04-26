/**
 * Ordered provenance entries carried by a boundary transition.
 *
 * This is a domain value: it names the replay-sufficient patch sequence
 * without claiming anything about wire shape.
 */

import WarpError from '../../errors/WarpError.ts';
import type Patch from '../../types/Patch.ts';

type PatchEntry = {
  readonly patch: Patch;
  readonly sha: string;
};

function copyPatchEntry(entry: PatchEntry): PatchEntry {
  return Object.freeze({
    patch: entry.patch,
    sha: entry.sha,
  });
}

export default class BoundaryTransitionProvenance {
  readonly #entries: ReadonlyArray<PatchEntry>;

  constructor(entries: readonly PatchEntry[] = []) {
    if (!Array.isArray(entries)) {
      throw new WarpError(
        'BoundaryTransitionProvenance requires an array of patch entries',
        'E_BOUNDARY_TRANSITION_PROVENANCE_INVALID',
      );
    }

    this.#entries = Object.freeze(entries.map(copyPatchEntry));
    Object.freeze(this);
  }

  static identity(): BoundaryTransitionProvenance {
    return new BoundaryTransitionProvenance([]);
  }

  get length(): number {
    return this.#entries.length;
  }

  entries(): PatchEntry[] {
    return this.#entries.map(copyPatchEntry);
  }

  at(index: number): PatchEntry | undefined {
    const entry = this.#entries.at(index);
    return entry === undefined ? undefined : copyPatchEntry(entry);
  }

  [Symbol.iterator](): Iterator<PatchEntry> {
    return this.entries()[Symbol.iterator]();
  }
}

export { BoundaryTransitionProvenance };
export type { PatchEntry };
