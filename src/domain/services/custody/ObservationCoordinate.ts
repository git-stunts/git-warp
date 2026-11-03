import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';
import ObservationAttemptId from './ObservationAttemptId.ts';
import ObservationDigest from './ObservationDigest.ts';

const TEXT_DOMAIN = 'warp-observation';
const TEXT_VERSION = '1';
const TEXT_PATTERN = /^warp-observation:1:([0-9a-f]{32}):([0-9a-f]{64}):([0-9a-f]{64})$/u;

/**
 * The private opaque locator of one retained observation: its reservation and
 * final record digest. Every component is a digest or an injected opaque id,
 * never a raw basis or writer. A token grants no authority, and parsing one
 * proves only its syntax, not that the observation exists or is intact.
 */
export default class ObservationCoordinate {
  readonly attemptId: ObservationAttemptId;
  readonly binding: ObservationDigest;
  readonly record: ObservationDigest;

  constructor(options: {
    readonly attemptId: ObservationAttemptId;
    readonly binding: ObservationDigest;
    readonly record: ObservationDigest;
  }) {
    const attempt = options.attemptId instanceof ObservationAttemptId;
    if (!attempt || !(options.binding instanceof ObservationDigest) || !(options.record instanceof ObservationDigest)) {
      throw new ObservationCustodyError('Observation coordinate needs an attempt, a binding and a record digest');
    }
    this.attemptId = options.attemptId;
    this.binding = options.binding;
    this.record = options.record;
    Object.freeze(this);
  }

  /** The coordinate in `text`, or null for anything but its exact canonical form. */
  static parse(text: string): ObservationCoordinate | null {
    const match = TEXT_PATTERN.exec(text);
    return match === null ? null : coordinateOf(match);
  }

  toString(): string {
    const parts = [TEXT_DOMAIN, TEXT_VERSION, this.attemptId.value, this.binding.hex, this.record.hex];
    return parts.join(':');
  }
}

function coordinateOf(match: RegExpExecArray): ObservationCoordinate {
  const [attemptId = '', binding = '', record = ''] = match.slice(1);
  return new ObservationCoordinate({
    attemptId: new ObservationAttemptId(attemptId),
    binding: new ObservationDigest(binding),
    record: new ObservationDigest(record),
  });
}
