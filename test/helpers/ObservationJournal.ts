import PatchJournalPort, { type AppendPatchRequest, type PublishedPatch } from '../../src/ports/PatchJournalPort.ts';
import type { PatchCommitMessage } from '../../src/ports/CommitMessageCodecPort.ts';
import PatchEntry from '../../src/domain/artifacts/PatchEntry.ts';
import Patch from '../../src/domain/types/Patch.ts';
import WarpStream from '../../src/domain/stream/WarpStream.ts';

/** Actual decoded frames with a poisoned tail and observable iterator cleanup. */
export default class ObservationJournal extends PatchJournalPort {
  readonly scans: Array<readonly [string, string]> = [];
  closed = 0;
  readonly entries: ReadonlyMap<string, PatchEntry>;
  readonly beforeScan: (writer: string, sha: string) => void;

  constructor(entries: ReadonlyMap<string, PatchEntry>, beforeScan: (writer: string, sha: string) => void = () => {}) {
    super();
    this.entries = entries;
    this.beforeScan = beforeScan;
  }

  override async appendPatch(_request: AppendPatchRequest): Promise<PublishedPatch> {
    throw new Error('Observation journal cannot publish');
  }
  override async readPatch(_message: PatchCommitMessage): Promise<Patch> {
    throw new Error('Observation journal requires an exact history coordinate');
  }
  override scanPatchRange(_writer: string, _from: string | null, _to: string): WarpStream<PatchEntry> {
    throw new Error('Observation must not load a history range');
  }
  override scanPatchHistory(writer: string, sha: string): WarpStream<PatchEntry> {
    this.scans.push([writer, sha]);
    this.beforeScan(writer, sha);
    const journal = this;
    return WarpStream.from((async function* () {
      try {
        const entry = journal.entries.get(sha);
        if (entry === undefined) { return; }
        yield entry;
        throw new Error('Observation consumed unrequested writer history');
      } finally { journal.closed++; }
    })());
  }
}
