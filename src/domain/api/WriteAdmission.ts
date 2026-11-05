import type { Plurality } from './Plurality.ts';
import { freezePlurality } from './PluralityRuntime.ts';

export type WriteAdmissionKind = 'derived' | 'plural';

/**
 * How a published write was admitted: `derived` directly, or `plural` when it
 * left concurrent values it never observed standing beside its own. A receipt
 * rebuilt after a crash knows the kind but not the sibling values.
 */
export default class WriteAdmission {
  readonly kind: WriteAdmissionKind;
  readonly plurality: readonly Plurality[];

  constructor(kind: WriteAdmissionKind, plurality: readonly Plurality[]) {
    this.kind = kind;
    this.plurality = freezePlurality(plurality);
    Object.freeze(this);
  }
}
