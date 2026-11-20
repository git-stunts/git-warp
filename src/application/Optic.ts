import OpticError from '../domain/errors/OpticError.ts';
import ObservedWarp from './ObservedWarp.ts';
import OpticQuery from './OpticQuery.ts';

/** Starts a question from an observed Warp. An unscoped Warp cannot ask one. */
export default function Optic(view: ObservedWarp): OpticQuery {
  if (!(view instanceof ObservedWarp)) {
    throw new OpticError('Optic requires a handle from forObserver', {
      code: 'E_OPTIC_VIEW',
    });
  }
  return new OpticQuery({ view, purpose: null, budget: null, subject: null, key: null });
}
