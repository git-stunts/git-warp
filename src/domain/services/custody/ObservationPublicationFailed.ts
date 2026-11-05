import type ObservationCustodyIdentity from './ObservationCustodyIdentity.ts';

/**
 * An armed write's one attempt definitely did not publish, and custody records
 * that. The attempt has ended and keeps its slot. The producer reports it as
 * unpublished, and there is deliberately no Coordinate here to hand out.
 */
export default class ObservationPublicationFailed {
  readonly identity: ObservationCustodyIdentity;

  constructor(identity: ObservationCustodyIdentity) {
    this.identity = identity;
    Object.freeze(this);
  }
}
