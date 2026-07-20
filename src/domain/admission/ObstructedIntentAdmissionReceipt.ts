import WarpError from '../errors/WarpError.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import ObstructedAdmission from './ObstructedAdmission.ts';

export type ObstructedIntentAdmissionReceiptFields = {
  readonly intentId: string;
  readonly outcome: ObstructedAdmission;
};

/** Receipt for a descriptor stopped by a typed admission gate. */
export default class ObstructedIntentAdmissionReceipt {
  readonly operation: 'write' = 'write';
  readonly intentId: string;
  readonly outcome: ObstructedAdmission;

  constructor(fields: ObstructedIntentAdmissionReceiptFields) {
    if (fields === null || fields === undefined) {
      throw new WarpError('ObstructedIntentAdmissionReceipt fields are required', 'E_VALIDATION');
    }
    requireNonEmptyString(fields.intentId, 'intentId');
    if (!(fields.outcome instanceof ObstructedAdmission)) {
      throw new WarpError('outcome must be an ObstructedAdmission', 'E_VALIDATION');
    }
    this.intentId = fields.intentId;
    this.outcome = fields.outcome;
    Object.freeze(this);
  }
}
