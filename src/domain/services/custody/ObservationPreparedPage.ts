import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';
import ObservationSupportSummary from './ObservationSupportSummary.ts';

/** The preparation custody page: canonical preparation bytes and their support summary. */
export default class ObservationPreparedPage {
  readonly summary: ObservationSupportSummary;
  readonly #preparation: Uint8Array;

  constructor(preparation: Uint8Array, summary: ObservationSupportSummary) {
    if (!(preparation instanceof Uint8Array) || !(summary instanceof ObservationSupportSummary)) {
      throw new ObservationCustodyError('Prepared page needs preparation bytes and a support summary');
    }
    this.#preparation = new Uint8Array(preparation);
    this.summary = summary;
    Object.freeze(this);
  }

  preparation(): Uint8Array {
    return this.#preparation.slice();
  }
}
