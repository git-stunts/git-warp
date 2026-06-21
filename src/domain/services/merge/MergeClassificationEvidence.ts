/**
 * MergeClassificationEvidence — narrow evidence for first-pass merge labels.
 *
 * @module domain/services/merge/MergeClassificationEvidence
 */

import WarpError from '../../errors/WarpError.ts';

export type MergeClassificationEvidenceFields = {
  readonly sharedPrecursor: boolean;
  readonly branchFootprintsOverlap: boolean;
  readonly candidateJoin: boolean;
  readonly obstructionWitness: boolean;
  readonly loweringWitness: boolean;
  readonly policyRequirement: boolean;
};

function requireBoolean(name: string, value: boolean): boolean {
  if (typeof value !== 'boolean') {
    throw new WarpError(`${name} must be a boolean`, 'E_MERGE_CLASSIFIER_INVALID_EVIDENCE');
  }
  return value;
}

export default class MergeClassificationEvidence {
  readonly sharedPrecursor: boolean;
  readonly branchFootprintsOverlap: boolean;
  readonly candidateJoin: boolean;
  readonly obstructionWitness: boolean;
  readonly loweringWitness: boolean;
  readonly policyRequirement: boolean;

  constructor(fields: MergeClassificationEvidenceFields) {
    this.sharedPrecursor = requireBoolean('sharedPrecursor', fields.sharedPrecursor);
    this.branchFootprintsOverlap = requireBoolean('branchFootprintsOverlap', fields.branchFootprintsOverlap);
    this.candidateJoin = requireBoolean('candidateJoin', fields.candidateJoin);
    this.obstructionWitness = requireBoolean('obstructionWitness', fields.obstructionWitness);
    this.loweringWitness = requireBoolean('loweringWitness', fields.loweringWitness);
    this.policyRequirement = requireBoolean('policyRequirement', fields.policyRequirement);
    Object.freeze(this);
  }
}
