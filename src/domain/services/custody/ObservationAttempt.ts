import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';
import ObservationCustodyIdentity from './ObservationCustodyIdentity.ts';
import ObservationPreparation from './ObservationPreparation.ts';

/** One attempt's original preparation, its canonical bytes and the reservation they derive. */
export default class ObservationAttempt {
  readonly preparation: ObservationPreparation;
  readonly identity: ObservationCustodyIdentity;
  readonly #bytes: Uint8Array;

  constructor(options: {
    readonly preparation: ObservationPreparation;
    readonly identity: ObservationCustodyIdentity;
    readonly bytes: Uint8Array;
  }) {
    const typed = options.preparation instanceof ObservationPreparation
      && options.identity instanceof ObservationCustodyIdentity && options.bytes instanceof Uint8Array;
    if (!typed) {
      throw new ObservationCustodyError('Observation attempt needs a preparation, an identity and canonical bytes');
    }
    if (options.preparation.attemptId.value !== options.identity.attemptId.value) {
      throw new ObservationCustodyError('Observation attempt preparation and identity name different attempts');
    }
    this.preparation = options.preparation;
    this.identity = options.identity;
    this.#bytes = new Uint8Array(options.bytes);
    Object.freeze(this);
  }

  bytes(): Uint8Array {
    return this.#bytes.slice();
  }
}
