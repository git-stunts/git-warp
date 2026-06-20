import { describe, expect, it } from 'vitest';

import MergeClassifier from '../../../../../src/domain/services/merge/MergeClassifier.ts';
import MergeClassificationEvidence from '../../../../../src/domain/services/merge/MergeClassificationEvidence.ts';
import {
  MERGE_CONFLICT_CORPUS,
  type MergeConflictCorpusCase,
} from '../../../../fixtures/mergeConflictCorpus.ts';

const classifier = new MergeClassifier();

function classify(fields: ConstructorParameters<typeof MergeClassificationEvidence>[0]) {
  return classifier.classify(new MergeClassificationEvidence(fields));
}

function evidenceForCorpusCase(item: MergeConflictCorpusCase): MergeClassificationEvidence {
  const base = {
    sharedPrecursor: true,
    branchFootprintsOverlap: true,
  };
  if (item.classification === 'projection') {
    return new MergeClassificationEvidence({
      ...base,
      candidateJoin: true,
      obstructionWitness: false,
      loweringWitness: item.liftingRemovesConflict,
      policyRequirement: false,
    });
  }
  if (item.classification === 'semantic') {
    return new MergeClassificationEvidence({
      ...base,
      candidateJoin: false,
      obstructionWitness: true,
      loweringWitness: false,
      policyRequirement: false,
    });
  }
  return new MergeClassificationEvidence({
    ...base,
    candidateJoin: false,
    obstructionWitness: true,
    loweringWitness: false,
    policyRequirement: true,
  });
}

describe('MergeClassifier', () => {
  it('classifies lossy map or import rendering conflicts as projection conflicts', () => {
    const result = classify({
      sharedPrecursor: true,
      branchFootprintsOverlap: true,
      candidateJoin: true,
      obstructionWitness: false,
      loweringWitness: true,
      policyRequirement: false,
    });

    expect(result.kind).toBe('projection');
    expect(result.confidence).toBe('high');
    expect(result.reasonCodes).toContain('lowering-witness');
  });

  it('classifies singleton slot obstructions as semantic conflicts', () => {
    const result = classify({
      sharedPrecursor: true,
      branchFootprintsOverlap: true,
      candidateJoin: false,
      obstructionWitness: true,
      loweringWitness: false,
      policyRequirement: false,
    });

    expect(result.kind).toBe('semantic');
    expect(result.confidence).toBe('high');
    expect(result.reasonCodes).toContain('obstruction-witness');
  });

  it('classifies release authority disputes as governance conflicts', () => {
    const result = classify({
      sharedPrecursor: true,
      branchFootprintsOverlap: true,
      candidateJoin: false,
      obstructionWitness: true,
      loweringWitness: false,
      policyRequirement: true,
    });

    expect(result.kind).toBe('governance');
    expect(result.confidence).toBe('high');
    expect(result.reasonCodes).toContain('policy-requirement');
  });

  it('agrees with the normalized merge conflict corpus labels', () => {
    for (const item of MERGE_CONFLICT_CORPUS) {
      const result = classifier.classify(evidenceForCorpusCase(item));

      expect(result.kind).toBe(item.classification);
    }
  });
});
