import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';
import ObservationDigest from './ObservationDigest.ts';

export type ObservationEvidenceKind = 'authority' | 'law' | 'dependency';

const EVIDENCE_KINDS: ReadonlySet<string> = new Set<ObservationEvidenceKind>(['authority', 'law', 'dependency']);

/** The digest of one piece of original authority, law or dependency evidence. */
export default class ObservationEvidenceBinding {
  readonly kind: ObservationEvidenceKind;
  readonly digest: ObservationDigest;

  constructor(kind: ObservationEvidenceKind, digest: ObservationDigest) {
    if (!EVIDENCE_KINDS.has(kind) || !(digest instanceof ObservationDigest)) {
      throw new ObservationCustodyError('Observation evidence binding needs a known kind and a digest');
    }
    this.kind = kind;
    this.digest = digest;
    Object.freeze(this);
  }
}
