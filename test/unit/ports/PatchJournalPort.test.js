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

  it('defaults usesExternalStorage to false', () => {
    const port = new PatchJournalPort();
    expect(port.usesExternalStorage).toBe(false);
  });

  it('throws on direct call to scanPatchRange()', () => {
    const port = new PatchJournalPort();
    expect(() => port.scanPatchRange('alice', null, 'head-sha')).toThrow('not implemented');
  });
});
