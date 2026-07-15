import { frontiersEqual } from './MaterializeHelpers.ts';
import type { ProvenanceIndex } from '../provenance/ProvenanceIndex.ts';

type ResidentProvenanceBasis = Readonly<{
  index: ProvenanceIndex | null;
  degraded: boolean;
  stateHash: string | null | undefined;
  frontier: Map<string, string> | null;
  ceiling: number | null;
}>;

type MaterializedProvenanceBasis = Readonly<{
  patchCount: number;
  stateHash: string;
  frontier: Map<string, string> | null;
  ceiling: number | null;
  provenanceIndex: ProvenanceIndex;
  provenanceDegraded: boolean;
}>;

type ProvenanceSelection = Readonly<{
  index: ProvenanceIndex;
  degraded: boolean;
}>;

function shouldPreserveResidentProvenance(
  resident: ResidentProvenanceBasis,
  materialized: MaterializedProvenanceBasis,
): boolean {
  if (materialized.frontier === null) {
    return false;
  }
  return [
    materialized.patchCount === 0,
    materialized.stateHash === resident.stateHash,
    materialized.ceiling === resident.ceiling,
    frontiersEqual(resident.frontier, materialized.frontier),
  ].every(Boolean);
}

export function selectProvenanceAfterMaterialization(
  resident: ResidentProvenanceBasis,
  materialized: MaterializedProvenanceBasis,
): ProvenanceSelection {
  if (
    resident.index !== null
    && shouldPreserveResidentProvenance(resident, materialized)
  ) {
    return {
      index: resident.index,
      degraded: resident.degraded,
    };
  }
  return {
    index: materialized.provenanceIndex,
    degraded: materialized.provenanceDegraded,
  };
}
