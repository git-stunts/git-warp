import { describe, expect, it } from 'vitest';
import { PatchBuilder } from '../../../../src/domain/services/PatchBuilder.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import {
  createPatchBuilderMockPersistence as createMockPersistence,
  createPatchJournal,
} from './PatchBuilderTestHarness.ts';

describe('PatchBuilder causal publication conflicts', () => {
  it('rejects a stale expected head before calling the journal', async () => {
    const expected = 'a'.repeat(40);
    const actual = 'f'.repeat(40);
    const persistence = createMockPersistence();
    persistence.readRef.mockResolvedValue(actual);
    const patchJournal = createPatchJournal(persistence);
    const builder = createBuilder({ persistence, patchJournal, expectedParentSha: expected });
    builder.addNode('node:a');

    await expect(builder.commit()).rejects.toMatchObject({
      code: 'WRITER_CAS_CONFLICT',
      expectedSha: expected,
      actualSha: actual,
    });
    expect(patchJournal.requests).toEqual([]);
  });

  it('reports deleted and unexpectedly-created refs symmetrically', async () => {
    const expected = 'a'.repeat(40);
    const deletedPersistence = createMockPersistence();
    deletedPersistence.readRef.mockResolvedValue(null);
    const deleted = createBuilder({
      persistence: deletedPersistence,
      patchJournal: createPatchJournal(deletedPersistence),
      expectedParentSha: expected,
    });
    deleted.addNode('node:a');

    const createdPersistence = createMockPersistence();
    createdPersistence.readRef.mockResolvedValue('b'.repeat(40));
    const created = createBuilder({
      persistence: createdPersistence,
      patchJournal: createPatchJournal(createdPersistence),
      expectedParentSha: null,
    });
    created.addNode('node:a');

    await expect(deleted.commit()).rejects.toMatchObject({
      expectedSha: expected,
      actualSha: null,
    });
    await expect(created.commit()).rejects.toMatchObject({
      expectedSha: null,
      actualSha: 'b'.repeat(40),
    });
  });

  it('maps a publication conflict to WriterError with the observed head', async () => {
    const actual = 'f'.repeat(40);
    const persistence = createMockPersistence();
    persistence.readRef.mockResolvedValueOnce(null).mockResolvedValue(actual);
    const patchJournal = createPatchJournal(persistence);
    patchJournal.failure = Object.assign(new Error('publication conflict'), {
      code: 'PUBLICATION_CONFLICT',
    });
    const builder = createBuilder({ persistence, patchJournal, expectedParentSha: null });
    builder.addNode('node:a');

    await expect(builder.commit()).rejects.toMatchObject({
      code: 'WRITER_CAS_CONFLICT',
      expectedSha: null,
      actualSha: actual,
    });
  });

  it('preserves a non-conflict storage failure when the head is unchanged', async () => {
    const persistence = createMockPersistence();
    persistence.readRef.mockResolvedValue(null);
    const patchJournal = createPatchJournal(persistence);
    const failure = new Error('storage offline');
    patchJournal.failure = failure;
    const builder = createBuilder({ persistence, patchJournal, expectedParentSha: null });
    builder.addNode('node:a');

    await expect(builder.commit()).rejects.toBe(failure);
  });

  it('forwards a matching head and custom target ref to storage', async () => {
    const parent = 'a'.repeat(40);
    const persistence = createMockPersistence();
    persistence.readRef.mockResolvedValue(parent);
    persistence.showNode.mockResolvedValue('not-a-patch-message');
    const patchJournal = createPatchJournal(persistence);
    const builder = createBuilder({
      persistence,
      patchJournal,
      expectedParentSha: parent,
      targetRefPath: 'refs/warp/events/strands/review',
    });
    builder.addNode('node:a');

    await builder.commit();

    expect(persistence.readRef).toHaveBeenCalledWith('refs/warp/events/strands/review');
    expect(patchJournal.requests[0]).toMatchObject({
      targetRef: 'refs/warp/events/strands/review',
      expectedHead: parent,
      parent,
    });
  });
});

function createBuilder(options: {
  persistence: ReturnType<typeof createMockPersistence>;
  patchJournal: ReturnType<typeof createPatchJournal>;
  expectedParentSha: string | null;
  targetRefPath?: string;
}): PatchBuilder {
  return new PatchBuilder({
    persistence: options.persistence,
    graphName: 'events',
    writerId: 'writer-1',
    lamport: 1,
    versionVector: VersionVector.empty(),
    getCurrentState: () => null,
    expectedParentSha: options.expectedParentSha,
    ...(options.targetRefPath === undefined ? {} : { targetRefPath: options.targetRefPath }),
    patchJournal: options.patchJournal,
    commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
  });
}
