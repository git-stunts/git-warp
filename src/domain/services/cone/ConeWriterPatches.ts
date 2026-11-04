import PatchEntry from '../../artifacts/PatchEntry.ts';
import ConeRecordError from '../../errors/ConeRecordError.ts';

/** One writer's patches after a folded position, oldest first, each decoded once. */
export default class ConeWriterPatches {
  readonly writerId: string;
  readonly entries: readonly PatchEntry[];

  constructor(writerId: string, entries: readonly PatchEntry[]) {
    if (!entries.every((entry) => entry instanceof PatchEntry && entry.patch.writer === writerId)) {
      throw new ConeRecordError('Cone writer patches must all belong to their writer', { context: { writerId } });
    }
    this.writerId = writerId;
    this.entries = Object.freeze([...entries]);
    Object.freeze(this);
  }
}
