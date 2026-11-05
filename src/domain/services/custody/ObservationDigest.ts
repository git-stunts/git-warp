import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';

const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;

/** A canonical lowercase SHA-256 digest. A digest is not an entropy or authority claim. */
export default class ObservationDigest {
  readonly hex: string;

  constructor(hex: string) {
    if (typeof hex !== 'string' || !DIGEST_PATTERN.test(hex)) {
      throw new ObservationCustodyError('Observation digest must be lowercase SHA-256 hex');
    }
    this.hex = hex;
    Object.freeze(this);
  }

  equals(other: ObservationDigest): boolean {
    return other.hex === this.hex;
  }
}
