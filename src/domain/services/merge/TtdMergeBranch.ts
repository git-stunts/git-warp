/**
 * TtdMergeBranch — branch strand identity for merge inspection.
 *
 * @module domain/services/merge/TtdMergeBranch
 */

import { requireNonEmptyText, requireStringRecord } from './TtdMergeValidation.ts';

export type TtdMergeBranchFields = {
  readonly branchId: string;
  readonly strandId: string;
  readonly fields: Record<string, string>;
};

export default class TtdMergeBranch {
  readonly branchId: string;
  readonly strandId: string;
  readonly fields: Readonly<Record<string, string>>;

  constructor(fields: TtdMergeBranchFields) {
    this.branchId = requireNonEmptyText(fields.branchId, 'branchId');
    this.strandId = requireNonEmptyText(fields.strandId, 'strandId');
    this.fields = requireStringRecord(fields.fields, 'branch.fields');
    Object.freeze(this);
  }
}
