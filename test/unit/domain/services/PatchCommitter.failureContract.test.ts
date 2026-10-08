import { expect, it, vi } from 'vitest';
import AssetHandle from '../../../../src/domain/storage/AssetHandle.ts';
import MessageCodecError from '../../../../src/domain/errors/MessageCodecError.ts';
import PropSet from '../../../../src/domain/types/ops/PropSet.ts';
import nullLogger from '../../../../src/domain/utils/nullLogger.ts';
import { createGitCasPatchStorage } from '../../../../src/ports/CommitMessageCodecPort.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { createPatchBuilder, createPatchBuilderMockPersistence, createPatchJournal } from './PatchBuilderTestHarness.ts';

it.each([new MessageCodecError('invalid persisted clock'), 'non-error decoder failure'])('does not publish when parent metadata cannot decode: %s', async failure => {
  const parent = 'd'.repeat(40);
  const persistence = createPatchBuilderMockPersistence();
  persistence.readRef.mockResolvedValue(parent);
  persistence.showNode.mockResolvedValue(DEFAULT_COMMIT_MESSAGE_CODEC.encodePatch({
    kind: 'patch', graph: 'test-graph', writer: 'writer1', lamport: 3, schema: 2,
    patchHandle: new AssetHandle('asset:parent'), storage: createGitCasPatchStorage({ encrypted: false }),
  }));
  const journal = createPatchJournal(persistence);
  const builder = createPatchBuilder({ persistence, patchJournal: journal, expectedParentSha: parent });
  builder.addNode('n');
  const decode = vi.spyOn(DEFAULT_COMMIT_MESSAGE_CODEC, 'decodePatch')
    .mockImplementation(() => { throw failure; });
  try {
    await expect(builder.commitWithEvidence()).rejects.toMatchObject({ code: 'E_PATCH_LAMPORT_PARSE' });
    expect(journal.requests).toHaveLength(0);
    expect(persistence.compareAndSwapRef).not.toHaveBeenCalled();
  } finally { decode.mockRestore(); }
});

it('retains a legacy property operation in the acknowledged patch publication', async () => {
  const persistence = createPatchBuilderMockPersistence();
  const journal = createPatchJournal(persistence);
  const builder = createPatchBuilder({ persistence, patchJournal: journal });
  builder.ops.push(new PropSet('n', 'k', 'legacy-value'));
  await builder.commitWithEvidence();
  expect(journal.requests[0]?.patch.ops[0]).toBeInstanceOf(PropSet);
});

it('requires a journal before any publication', async () => {
  const persistence = createPatchBuilderMockPersistence();
  const builder = createPatchBuilder({ persistence });
  builder.addNode('n');
  await expect(builder.commitWithEvidence()).rejects.toMatchObject({ code: 'E_MISSING_JOURNAL' });
  expect(persistence.compareAndSwapRef).not.toHaveBeenCalled();
});

it.each([new Error('callback failure'), 'non-error callback failure'])('preserves acknowledged publication when a success callback fails: %s', async failure => {
  const persistence = createPatchBuilderMockPersistence();
  const journal = createPatchJournal(persistence);
  const warn = vi.fn();
  const builder = createPatchBuilder({
    persistence, patchJournal: journal,
    logger: { debug: vi.fn(), info: vi.fn(), warn, error: vi.fn(), child: () => nullLogger },
    onCommitSuccess: async () => { throw failure; },
  });
  builder.addNode('n');
  const result = await builder.commitWithEvidence();
  expect(result.sha).toBe('c'.repeat(40));
  expect(journal.requests[0]?.targetRef).toBe('refs/warp/test-graph/writers/writer1');
  expect(journal.sha).toBe(result.sha);
  expect(warn).toHaveBeenCalledOnce();
  expect(journal.requests).toHaveLength(1);
});
