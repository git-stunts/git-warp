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

  /** The Coordinate in `text`, or null for anything but its exact saved form. */
  static parse(text: string): Coordinate | null {
    const parsed = ObservationCoordinate.parse(text);
    return parsed === null ? null : new Coordinate(parsed.toString());
  }

  toString(): string {
    return this.#text;
  }
}
