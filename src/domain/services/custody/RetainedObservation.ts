import type ObservationCoordinate from './ObservationCoordinate.ts';

/** Settled and verified: the original core and its required roots are durable. */
export default class RetainedObservation {
  readonly coordinate: ObservationCoordinate;
  readonly #core: Uint8Array;

  constructor(coordinate: ObservationCoordinate, core: Uint8Array) {
    this.coordinate = coordinate;
    this.#core = new Uint8Array(core);
    Object.freeze(this);
  }

  /** A fresh copy of the exact canonical receipt core. */
  core(): Uint8Array {
    return this.#core.slice();
  }
}
