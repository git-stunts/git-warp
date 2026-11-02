import ConeRecordKey from './ConeRecordKey.ts';
import { requireCount, requireIdentity } from './ConeRecordValidation.ts';

/**
 * How many entity admissions one writer chain has indexed (#1039). Admission
 * `i` of the chain lives in its own record at ordinal `i`, so indexing a new
 * admission writes one entry record and this tally, and an inventory pages a
 * chain from its tally downwards without reading history.
 */
export default class ConeAdmissionTally {
  readonly writerId: string;
  readonly count: number;

  constructor(fields: { readonly writerId: string; readonly count: number }) {
    this.writerId = requireIdentity(fields.writerId, 'writerId');
    this.count = requireCount(fields.count, 'count');
    Object.freeze(this);
  }

  /** The tally of a chain that has indexed nothing. */
  static empty(writerId: string): ConeAdmissionTally {
    return new ConeAdmissionTally({ writerId, count: 0 });
  }

  key(): ConeRecordKey {
    return ConeRecordKey.forAdmissionTally(this.writerId);
  }

  /** This tally after `added` more admissions. */
  advancedBy(added: number): ConeAdmissionTally {
    return new ConeAdmissionTally({ writerId: this.writerId, count: this.count + added });
  }

  equals(other: ConeAdmissionTally): boolean {
    return other.writerId === this.writerId && other.count === this.count;
  }
}
