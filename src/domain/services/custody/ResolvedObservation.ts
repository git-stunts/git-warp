import type ObservationPreparation from './ObservationPreparation.ts';
import type ObservationRecord from './ObservationRecord.ts';

/**
 * The exact original evidence of a Coordinate. Resolving grants no disclosure
 * authority: public integrations check current rights before using it.
 */
export default class ResolvedObservation {
  readonly preparation: ObservationPreparation;
  readonly record: ObservationRecord;
  readonly #core: Uint8Array;

  constructor(options: {
    readonly preparation: ObservationPreparation;
    readonly record: ObservationRecord;
    readonly core: Uint8Array;
  }) {
    this.preparation = options.preparation;
    this.record = options.record;
    this.#core = new Uint8Array(options.core);
    Object.freeze(this);
  }

  /** A fresh copy of the exact original canonical receipt core. */
  core(): Uint8Array {
    return this.#core.slice();
  }
}
