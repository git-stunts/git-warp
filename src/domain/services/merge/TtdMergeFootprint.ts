/**
 * TtdMergeFootprint — changed object keys for one branch strand.
 *
 * @module domain/services/merge/TtdMergeFootprint
 */

import { freezeSortedTexts, requireNonEmptyText } from './TtdMergeValidation.ts';

export type TtdMergeFootprintFields = {
  readonly branchId: string;
  readonly changedKeys: readonly string[];
};

export default class TtdMergeFootprint {
  readonly branchId: string;
  readonly changedKeys: readonly string[];

  constructor(fields: TtdMergeFootprintFields) {
    this.branchId = requireNonEmptyText(fields.branchId, 'branchId');
    this.changedKeys = freezeSortedTexts(fields.changedKeys, 'changedKeys');
    Object.freeze(this);
  }
}
