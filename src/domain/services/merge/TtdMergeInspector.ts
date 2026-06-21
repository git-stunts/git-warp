/**
 * TtdMergeInspector — deterministic merge protocol builder for TTD.
 *
 * @module domain/services/merge/TtdMergeInspector
 */

import MergeClassificationEvidence from './MergeClassificationEvidence.ts';
import MergeClassifier from './MergeClassifier.ts';
import TtdMergeBranch from './TtdMergeBranch.ts';
import TtdMergeFootprint from './TtdMergeFootprint.ts';
import TtdMergeInspection from './TtdMergeInspection.ts';
import TtdMergeLoweringWitness from './TtdMergeLoweringWitness.ts';
import TtdMergeObstructionWitness from './TtdMergeObstructionWitness.ts';
import {
  freezeSortedRecord,
  freezeSortedTexts,
  requireStringRecord,
} from './TtdMergeValidation.ts';
import type TtdMergePolicyRequirement from './TtdMergePolicyRequirement.ts';

export type TtdMergeObjectBranchInput = {
  readonly branchId: string;
  readonly strandId: string;
  readonly fields: Record<string, string>;
};

export type TtdMergeObjectInspectionInput = {
  readonly precursor: Record<string, string>;
  readonly left: TtdMergeObjectBranchInput;
  readonly right: TtdMergeObjectBranchInput;
  readonly policyRequirements?: readonly TtdMergePolicyRequirement[];
};

type ObstructionBuildInput = {
  readonly precursor: Readonly<Record<string, string>>;
  readonly left: TtdMergeBranch;
  readonly right: TtdMergeBranch;
  readonly overlapKeys: readonly string[];
};

type CandidateJoinInput = {
  readonly precursor: Readonly<Record<string, string>>;
  readonly left: TtdMergeBranch;
  readonly right: TtdMergeBranch;
  readonly leftChangedKeys: readonly string[];
  readonly rightChangedKeys: readonly string[];
  readonly obstructionCount: number;
};

type ObjectMergeComputation = {
  readonly precursor: Readonly<Record<string, string>>;
  readonly left: TtdMergeBranch;
  readonly right: TtdMergeBranch;
  readonly leftChangedKeys: readonly string[];
  readonly rightChangedKeys: readonly string[];
  readonly overlapKeys: readonly string[];
  readonly obstructions: readonly TtdMergeObstructionWitness[];
  readonly candidate: Readonly<Record<string, string>> | null;
  readonly lowerings: readonly TtdMergeLoweringWitness[];
  readonly policies: readonly TtdMergePolicyRequirement[];
};

function collectKeys(records: readonly Readonly<Record<string, string>>[]): readonly string[] {
  const keys: string[] = [];
  for (const record of records) {
    keys.push(...Object.keys(record));
  }
  return freezeSortedTexts(keys, 'objectKeys');
}

function valueAt(fields: Readonly<Record<string, string>>, key: string): string | null {
  return fields[key] ?? null;
}

function changedKeys(precursor: Readonly<Record<string, string>>, branch: TtdMergeBranch): readonly string[] {
  const keys = collectKeys([precursor, branch.fields]);
  return keys.filter((key) => valueAt(precursor, key) !== valueAt(branch.fields, key));
}

function overlap(leftKeys: readonly string[], rightKeys: readonly string[]): readonly string[] {
  const rightSet = new Set(rightKeys);
  return freezeSortedTexts(leftKeys.filter((key) => rightSet.has(key)), 'overlapKeys');
}

function buildObstructions(input: ObstructionBuildInput): readonly TtdMergeObstructionWitness[] {
  const witnesses: TtdMergeObstructionWitness[] = [];
  for (const key of input.overlapKeys) {
    const leftValue = valueAt(input.left.fields, key);
    const rightValue = valueAt(input.right.fields, key);
    if (leftValue !== rightValue) {
      witnesses.push(new TtdMergeObstructionWitness({
        fieldKey: key,
        precursorValue: valueAt(input.precursor, key),
        leftValue,
        rightValue,
      }));
    }
  }
  return Object.freeze(witnesses);
}

function applyValue(candidate: Record<string, string>, key: string, value: string | null): void {
  if (value === null) {
    delete candidate[key];
    return;
  }
  candidate[key] = value;
}

function applyChanges(
  candidate: Record<string, string>,
  branch: TtdMergeBranch,
  keys: readonly string[],
): void {
  for (const key of keys) {
    applyValue(candidate, key, valueAt(branch.fields, key));
  }
}

function buildCandidateJoin(input: CandidateJoinInput): Readonly<Record<string, string>> | null {
  if (input.obstructionCount > 0) {
    return null;
  }

  const candidate: Record<string, string> = { ...input.precursor };
  applyChanges(candidate, input.left, input.leftChangedKeys);
  applyChanges(candidate, input.right, input.rightChangedKeys);
  return freezeSortedRecord(candidate);
}

function buildLowerings(
  candidate: Readonly<Record<string, string>> | null,
  obstructionWitnesses: readonly TtdMergeObstructionWitness[],
): readonly TtdMergeLoweringWitness[] {
  if (candidate !== null) {
    const keyOrder = collectKeys([candidate]);
    return Object.freeze([
      new TtdMergeLoweringWitness({
        surface: 'canonical-json-object',
        basisKeyCount: keyOrder.length,
        conflictKeyCount: 0,
        keyOrder,
      }),
    ]);
  }

  const conflictKeys = obstructionWitnesses.map((witness) => witness.fieldKey);
  return Object.freeze([
    new TtdMergeLoweringWitness({
      surface: 'obstruction-list',
      basisKeyCount: conflictKeys.length,
      conflictKeyCount: conflictKeys.length,
      keyOrder: conflictKeys,
    }),
  ]);
}

function buildObjectMergeComputation(input: TtdMergeObjectInspectionInput): ObjectMergeComputation {
  const precursor = requireStringRecord(input.precursor, 'precursor');
  const left = new TtdMergeBranch(input.left);
  const right = new TtdMergeBranch(input.right);
  const leftChangedKeys = changedKeys(precursor, left);
  const rightChangedKeys = changedKeys(precursor, right);
  const overlapKeys = overlap(leftChangedKeys, rightChangedKeys);
  const obstructions = buildObstructions({ precursor, left, right, overlapKeys });
  const candidate = buildCandidateJoin({
    precursor,
    left,
    right,
    leftChangedKeys,
    rightChangedKeys,
    obstructionCount: obstructions.length,
  });
  const lowerings = buildLowerings(candidate, obstructions);
  return {
    precursor,
    left,
    right,
    leftChangedKeys,
    rightChangedKeys,
    overlapKeys,
    obstructions,
    candidate,
    lowerings,
    policies: Object.freeze([...(input.policyRequirements ?? [])]),
  };
}

function classifyObjectMerge(computation: ObjectMergeComputation, classifier: MergeClassifier) {
  return classifier.classify(new MergeClassificationEvidence({
    sharedPrecursor: true,
    branchFootprintsOverlap: computation.overlapKeys.length > 0,
    candidateJoin: computation.candidate !== null,
    obstructionWitness: computation.obstructions.length > 0,
    loweringWitness: computation.lowerings.length > 0,
    policyRequirement: computation.policies.length > 0,
  }));
}

function buildInspection(computation: ObjectMergeComputation, classifier: MergeClassifier): TtdMergeInspection {
  return new TtdMergeInspection({
    domain: 'json-object',
    sharedPrecursor: computation.precursor,
    branches: [computation.left, computation.right],
    footprints: [
      new TtdMergeFootprint({ branchId: computation.left.branchId, changedKeys: computation.leftChangedKeys }),
      new TtdMergeFootprint({ branchId: computation.right.branchId, changedKeys: computation.rightChangedKeys }),
    ],
    overlapKeys: computation.overlapKeys,
    candidateCanonicalJoin: computation.candidate,
    obstructionWitnesses: computation.obstructions,
    loweringWitnesses: computation.lowerings,
    policyRequirements: computation.policies,
    classification: classifyObjectMerge(computation, classifier),
  });
}

export default class TtdMergeInspector {
  readonly classifier: MergeClassifier;

  constructor(classifier: MergeClassifier = new MergeClassifier()) {
    this.classifier = classifier;
    Object.freeze(this);
  }

  inspectJsonObject(input: TtdMergeObjectInspectionInput): TtdMergeInspection {
    return buildInspection(buildObjectMergeComputation(input), this.classifier);
  }
}
