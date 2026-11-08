import type OpticObservation from '../domain/api/OpticObservation.ts';
import Purpose from '../domain/api/Purpose.ts';
import ReadBudget from '../domain/api/ReadBudget.ts';
import OpticError from '../domain/errors/OpticError.ts';
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
    if (!(purpose instanceof Purpose)) {
      throw new OpticError('forPurpose requires a Purpose instance', {
        code: 'E_OPTIC_PURPOSE',
      });
    }
    return new OpticQuery({ ...this.#fields, purpose });
  }

  /** Asks for a budget instead of the observer's default. Policy may still refuse it. */
  withBudget(budget: ReadBudget): OpticQuery {
    if (!(budget instanceof ReadBudget)) {
      throw new OpticError('withBudget requires a ReadBudget instance', {
        code: 'E_OPTIC_BUDGET',
      });
    }
    return new OpticQuery({ ...this.#fields, budget });
  }

  node(subject: string): OpticQuery {
    requireName(subject, 'A node question needs a subject');
    return new OpticQuery({ ...this.#fields, subject, key: null });
  }

  prop(key: string): OpticQuery {
    requireName(key, 'A property question needs a key');
    if (this.#fields.subject === null) {
      throw new OpticError('Ask about a node before one of its properties', {
        code: 'E_OPTIC_QUESTION',
      });
    }
    return new OpticQuery({ ...this.#fields, key });
  }

  async read(): Promise<OpticObservation> {
    const { view, purpose, budget, subject, key } = this.#fields;
    if (purpose === null) {
      throw new OpticError('A read needs a purpose: call forPurpose', {
        code: 'E_OPTIC_PURPOSE',
      });
    }
    if (subject === null) {
      throw new OpticError('A read needs a question', {
        code: 'E_OPTIC_QUESTION',
      });
    }
    return await view.run({ purpose, budget, question: { subject, key } });
  }
}

function requireName(value: string, message: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new OpticError(message, { code: 'E_OPTIC_QUESTION' });
  }
}
