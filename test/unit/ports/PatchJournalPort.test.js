import { describe, it, expect } from 'vitest';
import PatchJournalPort from '../../../src/ports/PatchJournalPort.ts';

describe('PatchJournalPort', () => {
  it('abstract methods are not callable on base prototype', () => {
    expect(PatchJournalPort.prototype.writePatch).toBeUndefined();
    expect(PatchJournalPort.prototype.readPatch).toBeUndefined();
    expect(PatchJournalPort.prototype.scanPatchRange).toBeUndefined();
  });

  it('defaults usesExternalStorage to false', () => {
    class TestJournal extends PatchJournalPort {
      async writePatch() { return 'oid'; }
      async readPatch() { return /** @type {any} */ ({}); }
      scanPatchRange() { return /** @type {any} */ (null); }
    }
    const journal = new TestJournal();
    expect(journal.usesExternalStorage).toBe(false);
  });

  it('concrete subclass satisfies the contract', async () => {
    class TestJournal extends PatchJournalPort {
      async writePatch() { return 'oid'; }
      async readPatch() { return /** @type {any} */ ({}); }
      scanPatchRange() { return /** @type {any} */ (null); }
    }
    const journal = new TestJournal();
    expect(journal).toBeInstanceOf(PatchJournalPort);
    expect(await (/** @type {any} */ (journal)).writePatch({})).toBe('oid');
  });
});
