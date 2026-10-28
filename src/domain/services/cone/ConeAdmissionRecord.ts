import ConeRecordError from '../../errors/ConeRecordError.ts';
import RetainedEntityAdmission from '../../entity/RetainedEntityAdmission.ts';
import ConeRecordKey from './ConeRecordKey.ts';
import { requireCount, requireIdentity } from './ConeRecordValidation.ts';

/**
 * One retained entity admission of a writer chain, at its ordinal in the
 * chain's admission order (patch order, then operation order) (#1039). It holds
 * everything an inventory Reading needs, so reading it never reads the patch.
 */
export default class ConeAdmissionRecord {
  readonly writerId: string;
  readonly ordinal: number;
  readonly admission: RetainedEntityAdmission;

  constructor(fields: { readonly writerId: string; readonly ordinal: number; readonly admission: RetainedEntityAdmission }) {
    this.writerId = requireIdentity(fields.writerId, 'writerId');
    this.ordinal = requireCount(fields.ordinal, 'ordinal');
    if (!(fields.admission instanceof RetainedEntityAdmission) || fields.admission.eventId.writerId !== this.writerId) {
      throw new ConeRecordError('Cone admission record requires an admission of its own writer chain', {
        context: { writerId: this.writerId, ordinal: this.ordinal },
      });
    }
    this.admission = fields.admission;
    Object.freeze(this);
  }

  key(): ConeRecordKey {
    return ConeRecordKey.forAdmission(this.writerId, this.ordinal);
  }
}
