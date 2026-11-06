import WarpError from '../domain/errors/WarpError.ts';
import ObservedWarp from './ObservedWarp.ts';
import OpticQuery from './OpticQuery.ts';

/** Starts a question from an observed Warp. An unscoped Warp cannot ask one. */
export default function Optic(view: ObservedWarp): OpticQuery {
  if (!(view instanceof ObservedWarp)) {
    throw new WarpError('Optic requires a handle from forObserver', 'E_OPTIC_VIEW');
  }
  return new OpticQuery({ view, purpose: null, budget: null, subject: null, key: null });
}
