import type WriteRace from './WriteRace.ts';

export type WriteAdmissionKind = 'derived' | 'plural';

/**
 * How a published write was admitted: `plural` when it left concurrent values it could
 * see it never observed beside its own, else `derived`. `derived` is not proof nothing
 * was overwritten: a process counts what this clone had folded when it first wrote as seen.
 * A receipt rebuilt after a crash knows the kind but not the races.
 */
export default class WriteAdmission {
  readonly kind: WriteAdmissionKind;
  readonly races: readonly WriteRace[];

  constructor(kind: WriteAdmissionKind, races: readonly WriteRace[]) {
    this.kind = kind;
    this.races = Object.freeze([...races]);
    Object.freeze(this);
  }
}
