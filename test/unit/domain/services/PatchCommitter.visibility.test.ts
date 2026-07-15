import { describe, expect, it, vi } from 'vitest';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import nullLogger from '../../../../src/domain/utils/nullLogger.ts';
import { commitPatch, type CommitState } from '../../../../src/domain/services/PatchCommitter.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import {
  createPatchBuilderMockPersistence,
  createPatchJournal,
} from './PatchBuilderTestHarness.ts';

describe('commitPatch semantic publication contract', () => {
  it('forwards causal identity and invokes success only after publication', async () => {
    const persistence = createPatchBuilderMockPersistence();
    const journal = createPatchJournal(persistence);
    const onCommitSuccess = vi.fn();

    const result = await commitPatch(makeState({
      persistence,
      journal,
      onCommitSuccess,
    }));

    expect(result).toMatchObject({
      sha: 'c'.repeat(40),
      retention: { reachability: 'anchored' },
    });
    expect(result.bundleHandle.toString()).toBe('bundle:test-patch');
    expect(journal.requests[0]).toMatchObject({
      graph: 'visibility-graph',
      writer: 'writer-a',
      targetRef: 'refs/warp/visibility-graph/writers/writer-a',
      expectedHead: null,
      parent: null,
    });
    expect(onCommitSuccess).toHaveBeenCalledWith(result);
  });

  it('does not invoke success when semantic publication fails', async () => {
    const persistence = createPatchBuilderMockPersistence();
    const journal = createPatchJournal(persistence);
    const failure = new Error('publication failed');
    journal.failure = failure;
    const onCommitSuccess = vi.fn();

    await expect(commitPatch(makeState({
      persistence,
      journal,
      onCommitSuccess,
    }))).rejects.toBe(failure);

    expect(onCommitSuccess).not.toHaveBeenCalled();
    expect(journal.requests).toHaveLength(1);
  });

  it('translates a storage conflict after observing the advanced writer head', async () => {
    const persistence = createPatchBuilderMockPersistence();
    persistence.readRef
      .mockResolvedValueOnce(null)
      .mockResolvedValue('f'.repeat(40));
    const journal = createPatchJournal(persistence);
    journal.failure = Object.assign(new Error('publication conflict'), {
      code: 'PUBLICATION_CONFLICT',
    });

    await expect(commitPatch(makeState({
      persistence,
      journal,
      onCommitSuccess: null,
    }))).rejects.toMatchObject({
      code: 'WRITER_CAS_CONFLICT',
      expectedSha: null,
      actualSha: 'f'.repeat(40),
    });
  });
});

function makeState(options: {
  persistence: ReturnType<typeof createPatchBuilderMockPersistence>;
  journal: ReturnType<typeof createPatchJournal>;
  onCommitSuccess: CommitState['onCommitSuccess'];
}): CommitState {
  return {
    persistence: options.persistence,
    graphName: 'visibility-graph',
    writerId: 'writer-a',
    lamport: 1,
    vv: VersionVector.empty(),
    ops: [new NodeAdd('node:a', Dot.create('writer-a', 1))],
    observedOperands: new Set(),
    writes: new Set(['node:a']),
    hasEdgeProps: false,
    expectedParentSha: null,
    targetRefPath: null,
    contentAssets: [],
    patchJournal: options.journal,
    commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
    logger: nullLogger,
    onCommitSuccess: options.onCommitSuccess,
  };
}
