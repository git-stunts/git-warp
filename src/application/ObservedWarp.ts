import type ObserverIdentity from '../domain/api/ObserverIdentity.ts';
import type OpticObservation from '../domain/api/OpticObservation.ts';
import type Purpose from '../domain/api/Purpose.ts';
import type ReadBudget from '../domain/api/ReadBudget.ts';
import type { OpticQuestion } from '../domain/api/OpticQuestion.ts';

/** What an observed handle asks of its Warp. */
export type ObservedWarpBackend = (request: {
  readonly observer: ObserverIdentity;
  readonly purpose: Purpose;
  readonly budget: ReadBudget | null;
  readonly question: OpticQuestion;
}) => Promise<OpticObservation>;

/** A Warp seen by one observer. Holding this authorizes nothing: each read asks the access boundary. */
export default class ObservedWarp {
  readonly observer: ObserverIdentity;
  readonly #backend: ObservedWarpBackend;

  constructor(observer: ObserverIdentity, backend: ObservedWarpBackend) {
    this.observer = observer;
    this.#backend = backend;
    Object.freeze(this);
  }

  /** @internal Runs a built question. Use `Optic(view)`. */
  async run(request: {
    readonly purpose: Purpose;
    readonly budget: ReadBudget | null;
    readonly question: OpticQuestion;
  }): Promise<OpticObservation> {
    return await this.#backend({ ...request, observer: this.observer });
  }
}
