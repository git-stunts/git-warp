/**
 * TtdMergeObstructionWitness — deterministic object-key collision evidence.
 *
 * @module domain/services/merge/TtdMergeObstructionWitness
 */

import { requireNonEmptyText } from './TtdMergeValidation.ts';

export type TtdMergeObstructionWitnessFields = {
  readonly fieldKey: string;
  readonly precursorValue: string | null;
  readonly leftValue: string | null;
  readonly rightValue: string | null;
};

function requireOptionalText(value: string | null, fieldName: string): string | null {
  if (value === null) {
    return null;
  }
  return requireNonEmptyText(value, fieldName);
}

export default class TtdMergeObstructionWitness {
  readonly fieldKey: string;
  readonly precursorValue: string | null;
  readonly leftValue: string | null;
  readonly rightValue: string | null;

  constructor(fields: TtdMergeObstructionWitnessFields) {
    this.fieldKey = requireNonEmptyText(fields.fieldKey, 'fieldKey');
    this.precursorValue = requireOptionalText(fields.precursorValue, 'precursorValue');
    this.leftValue = requireOptionalText(fields.leftValue, 'leftValue');
    this.rightValue = requireOptionalText(fields.rightValue, 'rightValue');
    Object.freeze(this);
  }
}
