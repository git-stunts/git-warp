import { describe, expect, it, vi } from 'vitest';
import PatchController from '../../../../src/domain/services/controllers/PatchController.ts';
import AssetHandle from '../../../../src/domain/storage/AssetHandle.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import { createGitCasPatchStorage } from '../../../../src/ports/CommitMessageCodecPort.ts';

const locator = Object.freeze({
  kind: 'patch' as const,
  graph: 'events',
  writer: 'writer-1',
  lamport: 1,
  patchHandle: new AssetHandle('asset:patch'),
  schema: 2,
  storage: createGitCasPatchStorage({ encrypted: false }),
});

describe('PatchController semantic patch reads', () => {
  it('delegates the decoded commit locator to PatchJournalPort', async () => {
    const patch = new Patch({
      schema: 2,
      writer: 'writer-1',
      lamport: 1,
      context: {},
      ops: [],
      reads: [],
      writes: [],
    });
    const readPatch = vi.fn(async () => patch);
    const controller = createController({ readPatch });

    await expect(controller._readPatch(locator)).resolves.toBe(patch);
    expect(readPatch).toHaveBeenCalledWith(locator);
  });

  it('propagates storage-owned read failures unchanged', async () => {
    const failure = new Error('asset unavailable');
    const controller = createController({
      readPatch: vi.fn(async () => await Promise.reject(failure)),
    });

    await expect(controller._readPatch(locator)).rejects.toBe(failure);
  });

  it('fails explicitly when no semantic journal is configured', async () => {
    const controller = new PatchController({ _patchJournal: null } as never);

    await expect(controller._readPatch(locator)).rejects.toMatchObject({
      code: 'E_MISSING_JOURNAL',
    });
  });
});

function createController(journal: { readPatch: (message: typeof locator) => Promise<Patch> }): PatchController {
  return new PatchController({ _patchJournal: journal } as never);
}
