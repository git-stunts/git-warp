import WarpError from './WarpError.ts';

/** A race a write would report breaks what every race must hold. */
export default class WriteRaceError extends WarpError {
  constructor(message: string) {
    super(message, 'E_WRITE_RACE');
  }
}
