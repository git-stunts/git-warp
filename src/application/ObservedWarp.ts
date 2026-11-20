import ObserverIdentity from '../domain/api/ObserverIdentity.ts';
import OpticError from '../domain/errors/OpticError.ts';

/**
 * A Warp seen by one observer. Holding this authorizes nothing: each read asks the access
 * boundary. It has no method that runs a question; read through `Optic(view)`.
 */
export default class ObservedWarp {
  readonly observer: ObserverIdentity;

  constructor(observer: ObserverIdentity) {
    if (!(observer instanceof ObserverIdentity)) {
      throw new OpticError('ObservedWarp requires an ObserverIdentity');
    }
    this.observer = observer;
    Object.freeze(this);
  }
}
