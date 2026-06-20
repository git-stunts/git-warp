/**
 * TtdMergePolicyRequirement — governance gate carried by merge inspection.
 *
 * @module domain/services/merge/TtdMergePolicyRequirement
 */

import { requireNonEmptyText } from './TtdMergeValidation.ts';

export type TtdMergePolicyRequirementFields = {
  readonly code: string;
  readonly message: string;
};

export default class TtdMergePolicyRequirement {
  readonly code: string;
  readonly message: string;

  constructor(fields: TtdMergePolicyRequirementFields) {
    this.code = requireNonEmptyText(fields.code, 'policy.code');
    this.message = requireNonEmptyText(fields.message, 'policy.message');
    Object.freeze(this);
  }
}
