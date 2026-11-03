import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';
import ObservationDigest from './ObservationDigest.ts';
import ObservationPublicationEvidence from './ObservationPublicationEvidence.ts';

/**
 * The final addressable record of an observation. It binds the original
 * preparation, the digest of the receipt core and any exact publication. The
 * Coordinate addresses this record, so the core never contains the Coordinate.
 */
export default class ObservationRecord {
  readonly preparation: ObservationDigest;
  readonly core: ObservationDigest;
  readonly publication: ObservationPublicationEvidence | null;

  constructor(options: {
    readonly preparation: ObservationDigest;
    readonly core: ObservationDigest;
    readonly publication: ObservationPublicationEvidence | null;
  }) {
    const digests = options.preparation instanceof ObservationDigest && options.core instanceof ObservationDigest;
    const publication = options.publication === null || options.publication instanceof ObservationPublicationEvidence;
    if (!digests || !publication) {
      throw new ObservationCustodyError('Observation record needs preparation and core digests');
    }
    this.preparation = options.preparation;
    this.core = options.core;
    this.publication = options.publication;
    Object.freeze(this);
  }
}
