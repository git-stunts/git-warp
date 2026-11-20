import type ObserverIdentity from '../domain/api/ObserverIdentity.ts';
import type OpticObservation from '../domain/api/OpticObservation.ts';
import type { OpticQuestion } from '../domain/api/OpticQuestion.ts';
import type Purpose from '../domain/api/Purpose.ts';
import type ReadBudget from '../domain/api/ReadBudget.ts';
import OpticError from '../domain/errors/OpticError.ts';
import type ObservedWarp from './ObservedWarp.ts';

/** A question `OpticQuery` built and checked. */
export type ObservedQuestion = {
  readonly purpose: Purpose;
  readonly budget: ReadBudget | null;
  readonly question: OpticQuestion;
};

/** What an observed handle asks of its Warp: the checked question, as the view's observer. */
export type ObservedWarpBackend = (request: {
  readonly observer: ObserverIdentity;
  readonly purpose: Purpose;
  readonly budget: ReadBudget | null;
  readonly question: OpticQuestion;
}) => Promise<OpticObservation>;

const BACKENDS = new WeakMap<ObservedWarp, ObservedWarpBackend>();

/**
 * Gives a view the Warp that answers it (#1052). Only `Warp.forObserver` binds a view. This
 * module is outside the package surface, so the public `ObservedWarp` has no method that runs
 * a question: every read goes through `Optic(view)`, whose builder checks the question first.
 */
export function bindObservedWarp(view: ObservedWarp, backend: ObservedWarpBackend): void {
  BACKENDS.set(view, backend);
}

/** Runs a checked question as the view's observer. The observer always comes from the view. */
export async function askObservedWarp(view: ObservedWarp, asked: ObservedQuestion): Promise<OpticObservation> {
  const backend = BACKENDS.get(view);
  if (backend === undefined) {
    throw new OpticError('Optic requires a handle from forObserver', { code: 'E_OPTIC_VIEW' });
  }
  return await backend({ observer: view.observer, purpose: asked.purpose, budget: asked.budget, question: asked.question });
}
