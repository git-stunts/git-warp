import { describe, it, expect } from 'vitest';
import PatchJournalPort from '../../../src/ports/PatchJournalPort.js';

describe('PatchJournalPort', () => {
  it('throws on direct call to writePatch()', async () => {
    const port = new PatchJournalPort();
    await expect(port.writePatch(/** @type {any} */ ({}))).rejects.toThrow('not implemented');
  });

  it('throws on direct call to readPatch()', async () => {
    const port = new PatchJournalPort();
    await expect(port.readPatch('abc123')).rejects.toThrow('not implemented');
  });
});
