import type WriteRace from './WriteRace.ts';

export type WriteAdmissionKind = 'derived' | 'plural';

/**
 * How a published write was admitted: `derived` directly, or `plural` when it
 * left concurrent values it never observed standing beside its own. A receipt
 * rebuilt after a crash knows the kind but not the races.
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
