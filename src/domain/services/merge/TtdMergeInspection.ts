/**
 * TtdMergeInspection — read-only protocol object for TTD merge panels.
 *
 * @module domain/services/merge/TtdMergeInspection
 */

import WarpError from '../../errors/WarpError.ts';
import MergeClassification from './MergeClassification.ts';
import TtdMergeBranch from './TtdMergeBranch.ts';
import TtdMergeFootprint from './TtdMergeFootprint.ts';
import {
  TTD_MERGE_INSPECTION_DOMAINS,
  type TtdMergeInspectionDomain,
} from './TtdMergeInspectionDomain.ts';
import TtdMergeLoweringWitness from './TtdMergeLoweringWitness.ts';
import TtdMergeObstructionWitness from './TtdMergeObstructionWitness.ts';
import TtdMergePolicyRequirement from './TtdMergePolicyRequirement.ts';
import {
  freezeSortedRecord,
  freezeSortedTexts,
  requireStringRecord,
} from './TtdMergeValidation.ts';

export const TTD_MERGE_INSPECTION_PROTOCOL_VERSION = 'ttd-merge-inspection/v1';

export type TtdMergeInspectionFields = {
  readonly domain: TtdMergeInspectionDomain;
  readonly sharedPrecursor: Record<string, string>;
  readonly branches: readonly TtdMergeBranch[];
  readonly footprints: readonly TtdMergeFootprint[];
  readonly overlapKeys: readonly string[];
  readonly candidateCanonicalJoin: Record<string, string> | null;
  readonly obstructionWitnesses: readonly TtdMergeObstructionWitness[];
  readonly loweringWitnesses: readonly TtdMergeLoweringWitness[];
  readonly policyRequirements: readonly TtdMergePolicyRequirement[];
  readonly classification: MergeClassification;
};

function requireDomain(domain: TtdMergeInspectionDomain): TtdMergeInspectionDomain {
  if (!TTD_MERGE_INSPECTION_DOMAINS.includes(domain)) {
    throw new WarpError('merge inspection domain is invalid', 'E_TTD_MERGE_INSPECTION_INVALID');
  }
  return domain;
}

function requireBranch(item: TtdMergeBranch): TtdMergeBranch {
  if (!(item instanceof TtdMergeBranch)) {
    throw new WarpError('merge inspection branches require TtdMergeBranch instances', 'E_TTD_MERGE_INSPECTION_INVALID');
  }
  return item;
}

function requireFootprint(item: TtdMergeFootprint): TtdMergeFootprint {
  if (!(item instanceof TtdMergeFootprint)) {
    throw new WarpError('merge inspection footprints require TtdMergeFootprint instances', 'E_TTD_MERGE_INSPECTION_INVALID');
  }
  return item;
}

function requireObstruction(item: TtdMergeObstructionWitness): TtdMergeObstructionWitness {
  if (!(item instanceof TtdMergeObstructionWitness)) {
    throw new WarpError('merge inspection obstructions require witness instances', 'E_TTD_MERGE_INSPECTION_INVALID');
  }
  return item;
}

function requireLowering(item: TtdMergeLoweringWitness): TtdMergeLoweringWitness {
  if (!(item instanceof TtdMergeLoweringWitness)) {
    throw new WarpError('merge inspection lowerings require witness instances', 'E_TTD_MERGE_INSPECTION_INVALID');
  }
  return item;
}

function requirePolicy(item: TtdMergePolicyRequirement): TtdMergePolicyRequirement {
  if (!(item instanceof TtdMergePolicyRequirement)) {
    throw new WarpError('merge inspection policies require policy instances', 'E_TTD_MERGE_INSPECTION_INVALID');
  }
  return item;
}

function requireClassification(classification: MergeClassification): MergeClassification {
  if (!(classification instanceof MergeClassification)) {
    throw new WarpError('merge inspection classification is invalid', 'E_TTD_MERGE_INSPECTION_INVALID');
  }
  return classification;
}

export default class TtdMergeInspection {
  readonly protocolVersion = TTD_MERGE_INSPECTION_PROTOCOL_VERSION;
  readonly domain: TtdMergeInspectionDomain;
  readonly sharedPrecursor: Readonly<Record<string, string>>;
  readonly branches: readonly TtdMergeBranch[];
  readonly footprints: readonly TtdMergeFootprint[];
  readonly overlapKeys: readonly string[];
  readonly candidateCanonicalJoin: Readonly<Record<string, string>> | null;
  readonly obstructionWitnesses: readonly TtdMergeObstructionWitness[];
  readonly loweringWitnesses: readonly TtdMergeLoweringWitness[];
  readonly policyRequirements: readonly TtdMergePolicyRequirement[];
  readonly classification: MergeClassification;

  constructor(fields: TtdMergeInspectionFields) {
    this.domain = requireDomain(fields.domain);
    this.sharedPrecursor = requireStringRecord(fields.sharedPrecursor, 'sharedPrecursor');
    this.branches = Object.freeze(fields.branches.map(requireBranch));
    this.footprints = Object.freeze(fields.footprints.map(requireFootprint));
    this.overlapKeys = freezeSortedTexts(fields.overlapKeys, 'overlapKeys');
    this.candidateCanonicalJoin = fields.candidateCanonicalJoin === null
      ? null
      : freezeSortedRecord(fields.candidateCanonicalJoin);
    this.obstructionWitnesses = Object.freeze(fields.obstructionWitnesses.map(requireObstruction));
    this.loweringWitnesses = Object.freeze(fields.loweringWitnesses.map(requireLowering));
    this.policyRequirements = Object.freeze(fields.policyRequirements.map(requirePolicy));
    this.classification = requireClassification(fields.classification);
    Object.freeze(this);
  }
}
