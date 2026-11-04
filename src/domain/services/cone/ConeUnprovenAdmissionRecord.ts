import WarpError from '../../errors/WarpError.ts';
import ConeRecordKey from './ConeRecordKey.ts';
import { requireCount, requireIdentity } from './ConeRecordValidation.ts';

/**
 * The position in a writer chain's admission order of a patch whose entity
 * admissions cannot be proven from its retained form, such as an unmarked
 * whole-patch entity footprint (#1039). It keeps the refusal's code and
 * message; an inventory that pages down to it obstructs with exactly that
 * refusal, where a history scan would have.
 */
export default class ConeUnprovenAdmissionRecord {
  readonly writerId: string;
  readonly ordinal: number;
  readonly patchSha: string;
  readonly code: string;
  readonly message: string;

  constructor(fields: {
    readonly writerId: string;
    readonly ordinal: number;
    readonly patchSha: string;
    readonly code: string;
    readonly message: string;
  }) {
    this.writerId = requireIdentity(fields.writerId, 'writerId');
    this.ordinal = requireCount(fields.ordinal, 'ordinal');
    this.patchSha = requireIdentity(fields.patchSha, 'patchSha');
    this.code = requireIdentity(fields.code, 'code');
    this.message = requireIdentity(fields.message, 'message');
    Object.freeze(this);
  }

  key(): ConeRecordKey {
    return ConeRecordKey.forAdmission(this.writerId, this.ordinal);
  }

  /** The refusal an inventory reaching this position reports. */
  refusal(): WarpError {
    return new WarpError(this.message, this.code, { context: { writerId: this.writerId, ordinal: this.ordinal } });
  }
}
