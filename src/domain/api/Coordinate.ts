import WarpError from '../errors/WarpError.ts';
import ObservationCoordinate from '../services/custody/ObservationCoordinate.ts';

/**
 * An opaque reference to one retained observation, obtained from a receipt or
 * parsed from its saved text. Parsing proves only its syntax: possessing one
 * grants no authority, and it cannot be built from parts.
 */
export default class Coordinate {
  readonly #text: string;

  private constructor(text: string) {
    this.#text = text;
    Object.freeze(this);
  }

  /** The Coordinate in `text`. Anything but its exact saved form is misuse, so it throws. */
  static parse(text: string): Coordinate {
    const parsed = ObservationCoordinate.parse(text);
    if (parsed === null) {
      throw new WarpError('This is not a saved Coordinate', 'E_COORDINATE_SYNTAX');
    }
    return new Coordinate(parsed.toString());
  }

  toString(): string {
    return this.#text;
  }
}
