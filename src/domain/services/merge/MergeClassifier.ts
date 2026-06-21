/**
 * MergeClassifier — first-pass labels for merge obstruction geometry.
 *
 * @module domain/services/merge/MergeClassifier
 */

import MergeClassification from './MergeClassification.ts';
import type MergeClassificationEvidence from './MergeClassificationEvidence.ts';

function precursorReason(evidence: MergeClassificationEvidence): string {
  return evidence.sharedPrecursor ? 'shared-precursor' : 'missing-shared-precursor';
}

function footprintReason(evidence: MergeClassificationEvidence): string {
  return evidence.branchFootprintsOverlap ? 'overlapping-footprints' : 'disjoint-footprints';
}

function baseReasons(evidence: MergeClassificationEvidence): string[] {
  return [precursorReason(evidence), footprintReason(evidence)];
}

function classifyWithoutPolicy(evidence: MergeClassificationEvidence, reasons: string[]): MergeClassification {
  if (evidence.candidateJoin && evidence.loweringWitness) {
    return new MergeClassification({ kind: 'projection', confidence: 'high', reasonCodes: [...reasons, 'candidate-join', 'lowering-witness'] });
  }
  if (evidence.candidateJoin) {
    return new MergeClassification({ kind: 'projection', confidence: 'medium', reasonCodes: [...reasons, 'candidate-join'] });
  }
  if (evidence.obstructionWitness) {
    return new MergeClassification({ kind: 'semantic', confidence: 'high', reasonCodes: [...reasons, 'obstruction-witness'] });
  }
  return new MergeClassification({ kind: 'semantic', confidence: 'medium', reasonCodes: [...reasons, 'no-candidate-join'] });
}

export default class MergeClassifier {
  classify(evidence: MergeClassificationEvidence): MergeClassification {
    const reasons = baseReasons(evidence);
    if (evidence.policyRequirement) {
      return new MergeClassification({ kind: 'governance', confidence: 'high', reasonCodes: [...reasons, 'policy-requirement'] });
    }
    return classifyWithoutPolicy(evidence, reasons);
  }
}
