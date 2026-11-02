import type ConeObstruction from '../services/cone/ConeObstruction.ts';
import QueryError from './QueryError.ts';

/**
 * A public read or write needed a lane's cone basis, and folding the lane's
 * new patches was obstructed (#1039). The obstruction is the typed evidence;
 * the read and write runtimes turn it into an obstructed or underdetermined
 * receipt with a repair hint instead of letting it escape.
 */
export default class ConeObstructedError extends QueryError {
  readonly obstruction: ConeObstruction;

  constructor(lane: string, obstruction: ConeObstruction) {
    super(obstruction.describe(), {
      code: 'E_OPTIC_CONE_OBSTRUCTED',
      context: { lane, obstruction: obstruction.code },
    });
    this.obstruction = obstruction;
  }
}
