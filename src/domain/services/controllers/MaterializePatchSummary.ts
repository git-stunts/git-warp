import WarpError from '../../errors/WarpError.ts';
import { ProvenanceIndex } from '../provenance/ProvenanceIndex.ts';
import type { PatchWithSha } from '../../capabilities/PatchCollector.ts';

function requireNonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new WarpError(
      `${field} must be a non-negative integer`,
      'E_MATERIALIZE_PATCH_SUMMARY',
      { context: { field, value } },
    );
  }
  return value;
}

export class MaterializePatchSummary {
  readonly patchCount: number;
  readonly maxObservedLamport: number;
  readonly provenance: ProvenanceIndex;

  constructor(fields: {
    patchCount: number;
    maxObservedLamport: number;
    provenance: ProvenanceIndex;
  }) {
    this.patchCount = requireNonNegativeInteger(fields.patchCount, 'patchCount');
    this.maxObservedLamport = requireNonNegativeInteger(fields.maxObservedLamport, 'maxObservedLamport');
    this.provenance = fields.provenance;
    Object.freeze(this);
  }

  static empty(provenanceBase?: ProvenanceIndex): MaterializePatchSummary {
    return new MaterializePatchSummary({
      patchCount: 0,
      maxObservedLamport: 0,
      provenance: provenanceBase ? provenanceBase.clone() : new ProvenanceIndex(),
    });
  }

}

export class MaterializePatchSummaryAccumulator {
  #patchCount = 0;
  #maxObservedLamport = 0;
  readonly #provenance: ProvenanceIndex;

  constructor(provenanceBase?: ProvenanceIndex) {
    this.#provenance = provenanceBase ? provenanceBase.clone() : new ProvenanceIndex();
  }

  record(entry: PatchWithSha): void {
    this.#patchCount += 1;
    if (Number.isInteger(entry.patch.lamport)) {
      this.#maxObservedLamport = Math.max(this.#maxObservedLamport, entry.patch.lamport);
    }
    this.#provenance.addPatch(entry.sha, entry.patch.reads, entry.patch.writes);
  }

  toSummary(): MaterializePatchSummary {
    return new MaterializePatchSummary({
      patchCount: this.#patchCount,
      maxObservedLamport: this.#maxObservedLamport,
      provenance: this.#provenance,
    });
  }
}

export function summarizeMaterializePatches(
  patches: readonly PatchWithSha[],
  provenanceBase?: ProvenanceIndex,
): MaterializePatchSummary {
  const accumulator = new MaterializePatchSummaryAccumulator(provenanceBase);
  for (const entry of patches) {
    accumulator.record(entry);
  }
  return accumulator.toSummary();
}
