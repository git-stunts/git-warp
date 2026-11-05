import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';
import { isObjectId } from './ObservationObjectId.ts';

/** The exact patch commit a write actually published, not one merely attempted or prepared. */
export default class ObservationPublicationEvidence {
  readonly writerId: string;
  readonly commit: string;

  constructor(writerId: string, commit: string) {
    if (typeof writerId !== 'string' || writerId.length === 0 || !isObjectId(commit)) {
      throw new ObservationCustodyError('Publication evidence needs a writer and a commit id');
    }
    this.writerId = writerId;
    this.commit = commit;
    Object.freeze(this);
  }
}
