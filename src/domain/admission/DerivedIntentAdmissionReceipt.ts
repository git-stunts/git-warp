import StorageRetentionWitness from '../storage/StorageRetentionWitness.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import WarpError from '../errors/WarpError.ts';
import DerivedAdmission from './DerivedAdmission.ts';

export type DerivedIntentAdmissionReceiptFields = {
  readonly intentId: string;
  readonly outcome: DerivedAdmission;
  readonly publicationRef: string;
  readonly retention: StorageRetentionWitness;
};

/** Receipt for a descriptor that directly extended its destination intent journal. */
export default class DerivedIntentAdmissionReceipt {
  readonly operation: 'write' = 'write';
  readonly intentId: string;
  readonly outcome: DerivedAdmission;
  readonly publicationRef: string;
  readonly retention: StorageRetentionWitness;

  constructor(fields: DerivedIntentAdmissionReceiptFields) {
    if (fields === null || fields === undefined) {
      throw new WarpError('DerivedIntentAdmissionReceipt fields are required', 'E_VALIDATION');
    }
    requireNonEmptyString(fields.intentId, 'intentId');
    requireNonEmptyString(fields.publicationRef, 'publicationRef');
    if (!(fields.outcome instanceof DerivedAdmission)) {
      throw new WarpError('outcome must be a DerivedAdmission', 'E_VALIDATION');
    }
    if (!(fields.retention instanceof StorageRetentionWitness)) {
      throw new WarpError('retention must be a StorageRetentionWitness', 'E_VALIDATION');
    }
    this.intentId = fields.intentId;
    this.outcome = fields.outcome;
    this.publicationRef = fields.publicationRef;
    this.retention = fields.retention;
    Object.freeze(this);
  }
}
