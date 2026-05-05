import { describe, it, expect } from 'vitest';
import PatchJournalPort, { type ReadPatchOptions } from '../../../src/ports/PatchJournalPort.ts';
import type Patch from '../../../src/domain/types/Patch.ts';
import type WarpStream from '../../../src/domain/stream/WarpStream.ts';
import type PatchEntry from '../../../src/domain/artifacts/PatchEntry.ts';

describe('PatchJournalPort', () => {
  it('abstract methods are not callable on base prototype', () => {
    expect(PatchJournalPort.prototype.writePatch).toBeUndefined();
    expect(PatchJournalPort.prototype.readPatch).toBeUndefined();
    expect(PatchJournalPort.prototype.scanPatchRange).toBeUndefined();
  });

  it('defaults usesExternalStorage to false', () => {
    class TestJournal extends PatchJournalPort {
      async writePatch(_patch: Patch) { return 'oid'; }
      async readPatch(_patchOid: string, _options?: ReadPatchOptions) { return {} as unknown as Patch; }
      scanPatchRange(_writerId: string, _fromSha: string | null, _toSha: string) {
        return null as unknown as WarpStream<PatchEntry>;
      }
    }
    const journal = new TestJournal();
    expect(journal.usesExternalStorage).toBe(false);
  });

  it('concrete subclass satisfies the contract', async () => {
    class TestJournal extends PatchJournalPort {
      async writePatch(_patch: Patch) { return 'oid'; }
      async readPatch(_patchOid: string, _options?: ReadPatchOptions) { return {} as unknown as Patch; }
      scanPatchRange(_writerId: string, _fromSha: string | null, _toSha: string) {
        return null as unknown as WarpStream<PatchEntry>;
      }
    }
    const journal = new TestJournal();
    expect(journal).toBeInstanceOf(PatchJournalPort);
    expect(await journal.writePatch({} as unknown as Patch)).toBe('oid');
  });
});
