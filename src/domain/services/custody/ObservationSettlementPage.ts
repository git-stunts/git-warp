import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';

/** The settlement custody page: the exact final record and receipt core bytes. */
export default class ObservationSettlementPage {
  readonly #record: Uint8Array;
  readonly #core: Uint8Array;

  constructor(record: Uint8Array, core: Uint8Array) {
    if (!(record instanceof Uint8Array) || !(core instanceof Uint8Array)) {
      throw new ObservationCustodyError('Settlement page needs record and core bytes');
    }
    this.#record = new Uint8Array(record);
    this.#core = new Uint8Array(core);
    Object.freeze(this);
  }

  record(): Uint8Array {
    return this.#record.slice();
  }

  core(): Uint8Array {
    return this.#core.slice();
  }
}
