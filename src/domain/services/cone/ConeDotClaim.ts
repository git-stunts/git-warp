import { sameMembers } from './ConeRecordEquality.ts';
import { requireIdentities } from './ConeRecordValidation.ts';

/**
 * Which elements one dot has been claimed by: the elements an add tagged
 * with it (owners) and the elements whose removes named it (removers).
 *
 * The reducer keeps one global tombstone set per OR-Set, so a remove that
 * names a dot hides every element that dot tagged. Cone records keep
 * tombstones per element, which is exact only while every tombstoned dot
 * belongs to one element. A claim that crosses elements (the #1022
 * duplicate-dot class) is the one case a cone cannot fold without guessing.
 */
export default class ConeDotClaim {
  readonly owners: ReadonlySet<string>;
  readonly removers: ReadonlySet<string>;

  constructor(fields: { readonly owners: ReadonlySet<string>; readonly removers: ReadonlySet<string> }) {
    this.owners = requireIdentities(fields.owners, 'dot owners');
    this.removers = requireIdentities(fields.removers, 'dot removers');
    Object.freeze(this);
  }

  static none(): ConeDotClaim {
    return new ConeDotClaim({ owners: new Set(), removers: new Set() });
  }

  withOwner(element: string): ConeDotClaim {
    return new ConeDotClaim({ owners: new Set([...this.owners, element]), removers: this.removers });
  }

  withRemover(element: string): ConeDotClaim {
    return new ConeDotClaim({ owners: this.owners, removers: new Set([...this.removers, element]) });
  }

  /** Every element this dot has been claimed by, in either role. */
  elements(): ReadonlySet<string> {
    return new Set([...this.owners, ...this.removers]);
  }

  /** True when a tombstone of this dot would hide an element other than the one its remove named. */
  crossesElements(): boolean {
    return this.removers.size > 0 && this.elements().size > 1;
  }

  equals(other: ConeDotClaim): boolean {
    return sameMembers(other.owners, this.owners) && sameMembers(other.removers, this.removers);
  }
}
