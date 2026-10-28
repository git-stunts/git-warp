import ConeRecordError from '../../errors/ConeRecordError.ts';
import { requireCount } from './ConeRecordValidation.ts';

const SHA_PATTERN = /^[0-9a-f]{40,64}$/u;

/** The last patch of one writer chain a cone basis has folded. */
export default class ConeWriterPosition {
  readonly sha: string;
  readonly lamport: number;

  constructor(sha: string, lamport: number) {
    if (!SHA_PATTERN.test(sha)) {
      throw new ConeRecordError('Cone writer position needs a commit sha', { context: { sha } });
    }
    this.sha = sha;
    this.lamport = requireCount(lamport, 'lamport');
    Object.freeze(this);
  }

  equals(other: ConeWriterPosition): boolean {
    return other.sha === this.sha && other.lamport === this.lamport;
  }
}
