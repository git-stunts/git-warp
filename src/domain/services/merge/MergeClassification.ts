/**
 * MergeClassification — result label emitted by MergeClassifier.
 *
 * @module domain/services/merge/MergeClassification
 */

import WarpError from '../../errors/WarpError.ts';
import type { MergeClassificationConfidence, MergeClassificationKind } from './MergeClassificationKind.ts';

export type MergeClassificationFields = {
  readonly kind: MergeClassificationKind;
  readonly confidence: MergeClassificationConfidence;
  readonly reasonCodes: readonly string[];
};

const KINDS: readonly MergeClassificationKind[] = Object.freeze(['projection', 'semantic', 'governance']);
const CONFIDENCES: readonly MergeClassificationConfidence[] = Object.freeze(['high', 'medium']);

function validateKind(kind: MergeClassificationKind): MergeClassificationKind {
  if (!KINDS.includes(kind)) {
    throw new WarpError('merge classification kind is invalid', 'E_MERGE_CLASSIFIER_INVALID_KIND');
  }
  return kind;
}

function validateConfidence(confidence: MergeClassificationConfidence): MergeClassificationConfidence {
  if (!CONFIDENCES.includes(confidence)) {
    throw new WarpError('merge classification confidence is invalid', 'E_MERGE_CLASSIFIER_INVALID_CONFIDENCE');
  }
  return confidence;
}

function validateReasonCodes(reasonCodes: readonly string[]): readonly string[] {
  if (reasonCodes.length === 0 || reasonCodes.some((code) => code.length === 0)) {
    throw new WarpError('merge classification requires non-empty reason codes', 'E_MERGE_CLASSIFIER_INVALID_REASON');
  }
  return Object.freeze([...reasonCodes]);
}

export default class MergeClassification {
  readonly kind: MergeClassificationKind;
  readonly confidence: MergeClassificationConfidence;
  readonly reasonCodes: readonly string[];

  constructor(fields: MergeClassificationFields) {
    this.kind = validateKind(fields.kind);
    this.confidence = validateConfidence(fields.confidence);
    this.reasonCodes = validateReasonCodes(fields.reasonCodes);
    Object.freeze(this);
  }
}
