import type OpticObservation from '../domain/api/OpticObservation.ts';
import type Purpose from '../domain/api/Purpose.ts';
import type ReadBudget from '../domain/api/ReadBudget.ts';
import WarpError from '../domain/errors/WarpError.ts';
import type ObservedWarp from './ObservedWarp.ts';

type QueryFields = {
  readonly view: ObservedWarp;
  readonly purpose: Purpose | null;
  readonly budget: ReadBudget | null;
  readonly subject: string | null;
  readonly key: string | null;
};

/** An immutable question. Building one reads nothing: `read` starts its one execution. */
export default class OpticQuery {
  readonly #fields: QueryFields;

  constructor(fields: QueryFields) {
    this.#fields = Object.freeze({ ...fields });
    Object.freeze(this);
  }

  forPurpose(purpose: Purpose): OpticQuery {
    return new OpticQuery({ ...this.#fields, purpose });
  }

  /** Asks for a budget instead of the observer's default. Policy may still refuse it. */
  withBudget(budget: ReadBudget): OpticQuery {
    return new OpticQuery({ ...this.#fields, budget });
  }

  node(subject: string): OpticQuery {
    requireName(subject, 'A node question needs a subject');
    return new OpticQuery({ ...this.#fields, subject, key: null });
  }

  prop(key: string): OpticQuery {
    requireName(key, 'A property question needs a key');
    if (this.#fields.subject === null) {
      throw new WarpError('Ask about a node before one of its properties', 'E_OPTIC_QUESTION');
    }
    return new OpticQuery({ ...this.#fields, key });
  }

  async read(): Promise<OpticObservation> {
    const { view, purpose, budget, subject, key } = this.#fields;
    if (purpose === null) {
      throw new WarpError('A read needs a purpose: call forPurpose', 'E_OPTIC_PURPOSE');
    }
    if (subject === null) {
      throw new WarpError('A read needs a question', 'E_OPTIC_QUESTION');
    }
    return await view.run({ purpose, budget, question: { subject, key } });
  }
}

function requireName(value: string, message: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(message, 'E_OPTIC_QUESTION');
  }
}
