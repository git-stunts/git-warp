import type { WriteAdmissionKind } from '../../api/WriteAdmission.ts';
import type WriteOccurrence from '../../api/WriteOccurrence.ts';
import WarpError from '../../errors/WarpError.ts';
import type ObservationAttemptId from '../custody/ObservationAttemptId.ts';
import type ObservationBindings from '../custody/ObservationBindings.ts';
import type ObservationPreparation from '../custody/ObservationPreparation.ts';
import type ObservationWritePremise from '../custody/ObservationWritePremise.ts';

/**
 * What a write saves before it reserves anything, so a restart can finish it. With
 * the commit, this reproduces the attempt's exact receipt core: nothing further is
 * saved between arming and publishing.
 */
export default class WriteAttemptRecord {
  readonly preparation: ObservationPreparation;
  readonly premise: ObservationWritePremise;
  readonly admission: WriteAdmissionKind;
  readonly occurrences: readonly WriteOccurrence[];
  /** Host time when saved; only ages an attempt nothing has armed. */
  readonly savedAt: number;
  /** A receipt told a caller to ask again, so only that caller's `reconcile` may finish this record. */
  readonly reported: boolean;

  constructor(fields: {
    readonly preparation: ObservationPreparation;
    readonly admission: WriteAdmissionKind;
    readonly occurrences: readonly WriteOccurrence[];
    readonly savedAt: number;
    readonly reported?: boolean;
  }) {
    const { writePremise } = fields.preparation.bindings;
    if (writePremise === null) {
      throw new WarpError('A write attempt record needs a write premise', 'E_WRITE_ATTEMPT_RECORD');
    }
    this.premise = writePremise;
    this.preparation = fields.preparation;
    this.admission = fields.admission;
    this.occurrences = Object.freeze([...fields.occurrences]);
    this.savedAt = fields.savedAt;
    this.reported = fields.reported ?? false;
    Object.freeze(this);
  }

  asReported(): WriteAttemptRecord {
    const { preparation, admission, occurrences, savedAt } = this;
    return new WriteAttemptRecord({ preparation, admission, occurrences, savedAt, reported: true });
  }

  get attemptId(): ObservationAttemptId {
    return this.preparation.attemptId;
  }

  get bindings(): ObservationBindings {
    return this.preparation.bindings;
  }
}
