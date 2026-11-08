import type { WriteAdmissionKind } from '../../api/WriteAdmission.ts';
import type WriteOccurrence from '../../api/WriteOccurrence.ts';
import type WriteRace from '../../api/WriteRace.ts';
import WarpError from '../../errors/WarpError.ts';
import type ObservationAttemptId from '../custody/ObservationAttemptId.ts';
import type ObservationBindings from '../custody/ObservationBindings.ts';
import type ObservationPreparation from '../custody/ObservationPreparation.ts';
import type ObservationWritePremise from '../custody/ObservationWritePremise.ts';
import { canonicalWriteRaces } from './canonicalWriteRaces.ts';

/**
 * What a write saves before it reserves anything, so a restart can finish it. With
 * the commit, this reproduces the attempt's exact receipt core: nothing further is
 * saved between arming and publishing. That includes the races the write was admitted
 * with, which are known before it arms and could not be recomputed later, since any
 * fold moves the cone.
 */
export default class WriteAttemptRecord {
  readonly preparation: ObservationPreparation;
  readonly premise: ObservationWritePremise;
  readonly admission: WriteAdmissionKind;
  /** In canonical order: a `plural` write has at least one, a `derived` write none. */
  readonly races: readonly WriteRace[];
  readonly occurrences: readonly WriteOccurrence[];
  /** Host time when saved; only ages an attempt nothing has armed. */
  readonly savedAt: number;
  /** A receipt told a caller to ask again, so only that caller's `reconcile` may finish this record. */
  readonly reported: boolean;
  /** The commit a receipt already reported as published, which nothing may later contradict. */
  readonly commit: string | null;

  constructor(fields: {
    readonly preparation: ObservationPreparation;
    readonly admission: WriteAdmissionKind;
    readonly races: readonly WriteRace[];
    readonly occurrences: readonly WriteOccurrence[];
    readonly savedAt: number;
    readonly reported?: boolean;
    readonly commit?: string | null;
  }) {
    const { writePremise } = fields.preparation.bindings;
    if (writePremise === null) {
      throw new WarpError('A write attempt record needs a write premise', 'E_WRITE_ATTEMPT_RECORD');
    }
    if ((fields.admission === 'plural') !== (fields.races.length > 0)) {
      throw new WarpError('A write is plural exactly when it saved a race', 'E_WRITE_ATTEMPT_RECORD');
    }
    this.premise = writePremise;
    this.preparation = fields.preparation;
    this.admission = fields.admission;
    this.races = canonicalWriteRaces(fields.races);
    this.occurrences = Object.freeze([...fields.occurrences]);
    this.savedAt = fields.savedAt;
    this.reported = fields.reported ?? false;
    this.commit = fields.commit ?? null;
    Object.freeze(this);
  }

  asReported(commit: string | null): WriteAttemptRecord {
    const { preparation, admission, races, occurrences, savedAt } = this;
    return new WriteAttemptRecord({ preparation, admission, races, occurrences, savedAt, reported: true, commit });
  }

  get attemptId(): ObservationAttemptId {
    return this.preparation.attemptId;
  }

  get bindings(): ObservationBindings {
    return this.preparation.bindings;
  }
}
