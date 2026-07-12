import { assert, describe, expect, it } from 'vitest';

import {
  TtdMergeBranch,
  TtdMergeFootprint,
  TtdMergeInspector,
  TtdMergeLoweringWitness,
  TtdMergeObstructionWitness,
  TtdMergePolicyRequirement,
} from '../../../../../diagnostics.ts';

function itemAt<T>(items: readonly T[], index: number): T {
  const item = items[index];
  assert.isDefined(item);
  return item;
}

describe('TtdMergeInspector', () => {
  it('renders a read-only object merge inspection with a canonical join', () => {
    const inspector = new TtdMergeInspector();

    const inspection = inspector.inspectJsonObject({
      precursor: { owner: 'ada', status: 'draft' },
      left: {
        branchId: 'branch-a',
        strandId: 'strand-a',
        fields: { owner: 'ada', status: 'ready' },
      },
      right: {
        branchId: 'branch-b',
        strandId: 'strand-b',
        fields: { owner: 'ada', priority: 'high', status: 'draft' },
      },
    });
    const leftBranch = itemAt<TtdMergeBranch>(inspection.branches, 0);
    const rightBranch = itemAt<TtdMergeBranch>(inspection.branches, 1);
    const leftFootprint = itemAt<TtdMergeFootprint>(inspection.footprints, 0);
    const rightFootprint = itemAt<TtdMergeFootprint>(inspection.footprints, 1);
    const lowering = itemAt<TtdMergeLoweringWitness>(inspection.loweringWitnesses, 0);

    expect(inspection.protocolVersion).toBe('ttd-merge-inspection/v1');
    expect(inspection.domain).toBe('json-object');
    expect(leftBranch.strandId).toBe('strand-a');
    expect(rightBranch.strandId).toBe('strand-b');
    expect(leftFootprint.changedKeys).toEqual(['status']);
    expect(rightFootprint.changedKeys).toEqual(['priority']);
    expect(inspection.overlapKeys).toEqual([]);
    expect(inspection.candidateCanonicalJoin).toEqual({
      owner: 'ada',
      priority: 'high',
      status: 'ready',
    });
    expect(inspection.obstructionWitnesses).toEqual([]);
    expect(lowering.surface).toBe('canonical-json-object');
    expect(inspection.classification.kind).toBe('projection');
    expect(inspection.classification.reasonCodes).toContain('candidate-join');
    expect(Object.isFrozen(inspection)).toBe(true);
    expect(Object.isFrozen(inspection.candidateCanonicalJoin)).toBe(true);
  });

  it('renders object key collisions as obstruction witnesses', () => {
    const inspector = new TtdMergeInspector();

    const inspection = inspector.inspectJsonObject({
      precursor: { owner: 'ada', status: 'draft' },
      left: {
        branchId: 'branch-a',
        strandId: 'strand-a',
        fields: { owner: 'ada', status: 'approved' },
      },
      right: {
        branchId: 'branch-b',
        strandId: 'strand-b',
        fields: { owner: 'ada', status: 'rejected' },
      },
    });
    const obstruction = itemAt<TtdMergeObstructionWitness>(inspection.obstructionWitnesses, 0);
    const lowering = itemAt<TtdMergeLoweringWitness>(inspection.loweringWitnesses, 0);

    expect(inspection.overlapKeys).toEqual(['status']);
    expect(inspection.candidateCanonicalJoin).toBeNull();
    expect(inspection.obstructionWitnesses).toHaveLength(1);
    expect(obstruction.fieldKey).toBe('status');
    expect(obstruction.precursorValue).toBe('draft');
    expect(obstruction.leftValue).toBe('approved');
    expect(obstruction.rightValue).toBe('rejected');
    expect(lowering.surface).toBe('obstruction-list');
    expect(inspection.classification.kind).toBe('semantic');
    expect(inspection.classification.reasonCodes).toContain('obstruction-witness');
  });

  it('keeps policy requirements as first-class governance evidence', () => {
    const inspector = new TtdMergeInspector();
    const policy = new TtdMergePolicyRequirement({
      code: 'human-review',
      message: 'A release authority must accept this join.',
    });

    const inspection = inspector.inspectJsonObject({
      precursor: { status: 'draft' },
      left: {
        branchId: 'branch-a',
        strandId: 'strand-a',
        fields: { status: 'ready' },
      },
      right: {
        branchId: 'branch-b',
        strandId: 'strand-b',
        fields: { status: 'ready' },
      },
      policyRequirements: [policy],
    });

    expect(inspection.candidateCanonicalJoin).toEqual({ status: 'ready' });
    expect(inspection.policyRequirements).toEqual([policy]);
    expect(inspection.classification.kind).toBe('governance');
    expect(inspection.classification.reasonCodes).toContain('policy-requirement');
  });
});
