import { describe, expect, it } from 'vitest';
import type PatchEntry from '../../../src/domain/artifacts/PatchEntry.ts';
import AssetHandle from '../../../src/domain/storage/AssetHandle.ts';
import BundleHandle from '../../../src/domain/storage/BundleHandle.ts';
import StorageHandle from '../../../src/domain/storage/StorageHandle.ts';
import StorageRetentionWitness, {
  StorageRetentionRoot,
} from '../../../src/domain/storage/StorageRetentionWitness.ts';
import WarpStream from '../../../src/domain/stream/WarpStream.ts';
import type Patch from '../../../src/domain/types/Patch.ts';
import type { PatchCommitMessage } from '../../../src/ports/CommitMessageCodecPort.ts';
import PatchJournalPort, {
  type AppendPatchRequest,
  type PublishedPatch,
} from '../../../src/ports/PatchJournalPort.ts';

describe('PatchJournalPort', () => {
  it('declares semantic append, read, and range scan methods', () => {
    expect(PatchJournalPort.prototype.appendPatch).toBeUndefined();
    expect(PatchJournalPort.prototype.readPatch).toBeUndefined();
    expect(PatchJournalPort.prototype.scanPatchRange).toBeUndefined();
  });

  it('returns publication and retention evidence without a naked OID', async () => {
    const patch = Object.freeze({ schema: 3, lamport: 1 }) as Patch;
    const handle = new AssetHandle('asset:patch');
    const published: PublishedPatch = Object.freeze({
      sha: 'commit-sha',
      bundleHandle: new BundleHandle('bundle:patch'),
      stagedPatch: Object.freeze({
        handle,
        size: 1,
        observedAt: '1970-01-01T00:00:00.000Z',
        retention: Object.freeze({ reachability: 'unanchored', protection: 'not-established' }),
      }),
      retention: new StorageRetentionWitness({
        handle: new StorageHandle('bundle:patch'),
        policy: 'pinned',
        reachability: 'anchored',
        root: new StorageRetentionRoot({
          kind: 'publication',
          namespace: 'g',
          locator: 'refs/warp/g/writers/a',
          generation: 'commit-sha',
          path: '/',
        }),
        observedAt: '1970-01-01T00:00:00.000Z',
      }),
    });
    class TestJournal extends PatchJournalPort {
      async appendPatch(_request: AppendPatchRequest) { return published; }
      async readPatch(_message: PatchCommitMessage) { return patch; }
      scanPatchRange(_writer: string, _from: string | null, _to: string) {
        return WarpStream.of<PatchEntry>();
      }
    }
    const journal = new TestJournal();

    const result = await journal.appendPatch({
      patch,
      graph: 'g',
      writer: 'a',
      targetRef: 'refs/warp/g/writers/a',
      expectedHead: null,
      parent: null,
      attachments: [],
    });
    expect(result.stagedPatch.handle).toBe(handle);
    expect(result.retention.reachability).toBe('anchored');
  });
});
