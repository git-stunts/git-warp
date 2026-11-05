import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';
import { isObservationName } from './observationName.ts';
import ObservationDigest from './ObservationDigest.ts';
import { isObjectId } from './ObservationObjectId.ts';

/** What a write attempt submitted: its intent sequence and selected writer predecessor. */
export default class ObservationWritePremise {
  readonly intents: ObservationDigest;
  readonly writerId: string;
  /** The selected writer's head when premises were captured; null for its first patch. */
  readonly predecessor: string | null;

  constructor(options: {
    readonly intents: ObservationDigest;
    readonly writerId: string;
    readonly predecessor: string | null;
  }) {
    if (!(options.intents instanceof ObservationDigest) || !isValidWriter(options)) {
      throw new ObservationCustodyError('Observation write premise needs intents, a writer and its predecessor');
    }
    this.intents = options.intents;
    this.writerId = options.writerId;
    this.predecessor = options.predecessor;
    Object.freeze(this);
  }
}

function isValidWriter(options: { readonly writerId: string; readonly predecessor: string | null }): boolean {
  return isObservationName(options.writerId) && (options.predecessor === null || isObjectId(options.predecessor));
}
