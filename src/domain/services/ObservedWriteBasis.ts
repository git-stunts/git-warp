import VersionVector from '../crdt/VersionVector.ts';
import InvalidWriteObservationError from '../errors/InvalidWriteObservationError.ts';
import ObservedWriteFrontier from '../types/ObservedWriteFrontier.ts';
import { graphFrontierCoordinateRef } from './admission/GraphCoordinateRef.ts';

/** Clock, context and coordinate derived from the same inspected patch set. */
export default class ObservedWriteBasis {
  readonly observation: ObservedWriteFrontier;
  readonly lamport: number;
  readonly coordinateRef: string;
  readonly #context: VersionVector;

  constructor(observation: ObservedWriteFrontier, context: VersionVector, ownCandidate: number) {
    if (!(observation instanceof ObservedWriteFrontier) || !(context instanceof VersionVector)) {
      throw new InvalidWriteObservationError('Write basis requires validated observation and context');
    }
    this.observation = observation;
    this.lamport = ObservedWriteBasis.nextInspectableLamport(observation, ownCandidate);
    this.coordinateRef = graphFrontierCoordinateRef(observation.graphName, observation.frontier());
    this.#context = context.clone();
    Object.freeze(this);
  }

  private static nextInspectableLamport(observation: ObservedWriteFrontier, ownCandidate: number): number {
    if (!Number.isSafeInteger(ownCandidate) || ownCandidate < 1) {
      throw new InvalidWriteObservationError('Prepared write clock cannot be safely advanced');
    }
    const lamport = Math.max(ownCandidate, observation.maxLamport() + 1);
    if (lamport >= Number.MAX_SAFE_INTEGER) {
      throw new InvalidWriteObservationError('Prepared write clock cannot remain an inspectable writer head');
    }
    return lamport;
  }

  context(): VersionVector { return this.#context.clone(); }
}
