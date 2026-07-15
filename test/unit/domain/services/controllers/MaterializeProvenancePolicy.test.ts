import { describe, expect, it } from 'vitest';

import { selectProvenanceAfterMaterialization } from '../../../../../src/domain/services/controllers/MaterializeProvenancePolicy.ts';
import { ProvenanceIndex } from '../../../../../src/domain/services/provenance/ProvenanceIndex.ts';

type ResidentBasis = Parameters<typeof selectProvenanceAfterMaterialization>[0];
type MaterializedBasis = Parameters<typeof selectProvenanceAfterMaterialization>[1];

const FRONTIER = new Map([['writer-1', 'tip-1']]);

function provenance(entity: string, patch: string): ProvenanceIndex {
  return new ProvenanceIndex().addPatch(patch, [], [entity]);
}

function residentBasis(index: ProvenanceIndex): ResidentBasis {
  return {
    index,
    degraded: false,
    stateHash: 'state-1',
    frontier: FRONTIER,
    ceiling: null,
  };
}

function materializedBasis(index: ProvenanceIndex): MaterializedBasis {
  return {
    patchCount: 0,
    stateHash: 'state-1',
    frontier: new Map(FRONTIER),
    ceiling: null,
    provenanceIndex: index,
    provenanceDegraded: true,
  };
}

describe('selectProvenanceAfterMaterialization', () => {
  it('preserves a basis-equivalent resident index and its degraded posture', () => {
    const residentIndex = provenance('node:resident', 'patch-resident');
    const cachedIndex = new ProvenanceIndex();
    const resident = { ...residentBasis(residentIndex), degraded: true };

    const selection = selectProvenanceAfterMaterialization(
      resident,
      materializedBasis(cachedIndex),
    );

    expect(selection.index).toBe(residentIndex);
    expect(selection.degraded).toBe(true);
  });

  const rejectionCases: ReadonlyArray<{
    label: string;
    resident?: Partial<ResidentBasis>;
    materialized?: Partial<MaterializedBasis>;
  }> = [
    { label: 'a missing resident index', resident: { index: null } },
    { label: 'replayed patches', materialized: { patchCount: 1 } },
    { label: 'a different state', materialized: { stateHash: 'state-2' } },
    { label: 'a different ceiling', materialized: { ceiling: 7 } },
    {
      label: 'a different frontier',
      materialized: { frontier: new Map([['writer-1', 'tip-2']]) },
    },
    { label: 'an unanchored materialization', materialized: { frontier: null } },
  ];

  it.each(rejectionCases)('uses materialized provenance for $label', ({ resident, materialized }) => {
    const residentIndex = provenance('node:resident', 'patch-resident');
    const cachedIndex = provenance('node:cached', 'patch-cached');

    const selection = selectProvenanceAfterMaterialization(
      { ...residentBasis(residentIndex), ...resident },
      { ...materializedBasis(cachedIndex), ...materialized },
    );

    expect(selection.index).toBe(cachedIndex);
    expect(selection.degraded).toBe(true);
  });
});
