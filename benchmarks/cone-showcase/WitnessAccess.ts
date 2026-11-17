import { WarpAccessDenied, WarpAccessPort, WarpWriteGrant, type WarpWriteRequest } from '../../index.ts';

/** Generous enough for a bulk-load patch of 50 threads; every measured save is far below it. */
const WITNESS_BUDGET = Object.freeze({ records: 100_000, bytes: 64 * 1024 * 1024, work: 1_000_000 });

/** The witness's access boundary: it grants the witness writers one fixed policy decision. */
export default class WitnessAccess extends WarpAccessPort {
  readonly #writers: ReadonlySet<string>;

  constructor(writers: readonly string[]) {
    super();
    this.#writers = new Set(writers);
  }

  override authorizeWrite(request: WarpWriteRequest): Promise<WarpWriteGrant | WarpAccessDenied> {
    return Promise.resolve(this.#writers.has(request.writer)
      ? new WarpWriteGrant({ authority: 'cone-showcase-witness', budget: WITNESS_BUDGET })
      : new WarpAccessDenied(`the witness has no writer named ${request.writer}`));
  }
}
