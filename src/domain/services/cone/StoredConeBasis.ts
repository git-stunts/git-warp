import ConeRecordError from '../../errors/ConeRecordError.ts';
import ConeBasis from './ConeBasis.ts';

const REVISION_PATTERN = /^[0-9a-f]{4,64}$/u;

/** A published cone basis and the storage revision its head ref points at. */
export default class StoredConeBasis {
  readonly basis: ConeBasis;
  /** The head revision a compare-and-swap publication must expect. */
  readonly revision: string;

  constructor(basis: ConeBasis, revision: string) {
    if (!(basis instanceof ConeBasis) || !REVISION_PATTERN.test(revision)) {
      throw new ConeRecordError('Stored cone basis needs a basis and a head revision', { context: { revision } });
    }
    this.basis = basis;
    this.revision = revision;
    Object.freeze(this);
  }
}
