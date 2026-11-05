import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';
import { isObservationName } from './observationName.ts';

export type ObservationReceiptFamily = 'write' | 'observation';

const RECEIPT_FAMILIES: ReadonlySet<string> = new Set<ObservationReceiptFamily>(['write', 'observation']);

/**
 * The canonical content of a final receipt, without its Coordinate. The
 * producer owns the variant and its outcome bytes (#1051, #1052); physical
 * I/O, timing and retry diagnostics stay out of them.
 */
export default class ObservationReceiptCore {
  readonly family: ObservationReceiptFamily;
  readonly variant: string;
  readonly #outcome: Uint8Array;

  constructor(options: {
    readonly family: ObservationReceiptFamily;
    readonly variant: string;
    readonly outcome: Uint8Array;
  }) {
    if (!RECEIPT_FAMILIES.has(options.family) || !isObservationName(options.variant) || !(options.outcome instanceof Uint8Array)) {
      throw new ObservationCustodyError('Observation receipt core needs a family, a variant and outcome bytes');
    }
    this.family = options.family;
    this.variant = options.variant;
    this.#outcome = new Uint8Array(options.outcome);
    Object.freeze(this);
  }

  /** A fresh copy of the producer's canonical outcome bytes. */
  outcome(): Uint8Array {
    return this.#outcome.slice();
  }
}
