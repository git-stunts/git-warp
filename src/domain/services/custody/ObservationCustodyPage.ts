import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';
import ObservationCustodyRoots from './ObservationCustodyRoots.ts';

/** One page of custody evidence: its record bytes and the Git edges they require. */
export default class ObservationCustodyPage {
  readonly roots: ObservationCustodyRoots;
  readonly #record: Uint8Array;

  constructor(record: Uint8Array, roots: ObservationCustodyRoots) {
    if (!(record instanceof Uint8Array) || !(roots instanceof ObservationCustodyRoots)) {
      throw new ObservationCustodyError('Custody page needs record bytes and roots');
    }
    this.#record = new Uint8Array(record);
    this.roots = roots;
    Object.freeze(this);
  }

  /** A fresh copy of the page's record bytes. */
  record(): Uint8Array {
    return this.#record.slice();
  }
}
