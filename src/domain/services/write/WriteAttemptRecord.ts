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
  /**
   * Only a `reconcile` may finish this record: a receipt told a caller to ask again, or a
   * sweep found its predecessor further back than a probe reads, and no sweep reads for it again.
   */
  readonly reported: boolean;
  /** The commit a receipt already reported as published, which nothing may later contradict. */
  readonly commit: string | null;

  constructor(fields: {
    readonly preparation: ObservationPreparation;
    readonly admission: WriteAdmissionKind;
    readonly occurrences: readonly WriteOccurrence[];
    readonly savedAt: number;
    readonly reported?: boolean;
    readonly commit?: string | null;
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
    this.commit = fields.commit ?? null;
    Object.freeze(this);
  }

  asReported(commit: string | null): WriteAttemptRecord {
    const { preparation, admission, occurrences, savedAt } = this;
    return new WriteAttemptRecord({ preparation, admission, occurrences, savedAt, reported: true, commit });
  }

  get attemptId(): ObservationAttemptId {
    return this.preparation.attemptId;
  }

  get bindings(): ObservationBindings {
    return this.preparation.bindings;
  }
}
