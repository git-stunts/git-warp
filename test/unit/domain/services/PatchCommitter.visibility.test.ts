import { describe, expect, it } from 'vitest';
import InMemoryGraphAdapter from '../../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import { CborPatchJournalAdapter } from '../../../../src/infrastructure/adapters/CborPatchJournalAdapter.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { PatchBuilder } from '../../../../src/domain/services/PatchBuilder.ts';
import { buildWriterRef } from '../../../../src/domain/utils/RefLayout.ts';
import WriterError from '../../../../src/domain/errors/WriterError.ts';
import { openRuntimeHostProduct } from '../../../../src/domain/warp/RuntimeHostProduct.ts';

const GRAPH_NAME = 'visibility';
const WRITER_ID = 'writer-a';
const DRIFT_SHA = 'd'.repeat(40);

type CasUpdate = {
  readonly ref: string;
  readonly newOid: string;
  readonly expectedOid: string | null;
};

class RecordingGraphAdapter extends InMemoryGraphAdapter {
  readonly casUpdates: CasUpdate[] = [];

  override async compareAndSwapRef(
    ref: string,
    newOid: string,
    expectedOid: string | null,
  ): Promise<void> {
    this.casUpdates.push(Object.freeze({ ref, newOid, expectedOid }));
    await super.compareAndSwapRef(ref, newOid, expectedOid);
  }
}

class DriftAfterCasGraphAdapter extends RecordingGraphAdapter {
  override async compareAndSwapRef(
    ref: string,
    newOid: string,
    expectedOid: string | null,
  ): Promise<void> {
    await super.compareAndSwapRef(ref, newOid, expectedOid);
    await super.updateRef(ref, DRIFT_SHA);
  }
}

function createPatchJournal(persistence: InMemoryGraphAdapter): CborPatchJournalAdapter {
  return new CborPatchJournalAdapter({
    codec: new CborCodec(),
    blobPort: persistence,
  });
}

function createBuilder(persistence: InMemoryGraphAdapter): PatchBuilder {
  return new PatchBuilder({
    persistence,
    patchJournal: createPatchJournal(persistence),
    graphName: GRAPH_NAME,
    writerId: WRITER_ID,
    lamport: 1,
    versionVector: VersionVector.empty(),
    getCurrentState: () => null,
    expectedParentSha: null,
  });
}

describe('PatchCommitter visibility contract', () => {
  it('advances the writer ref with compare-and-swap before reporting success', async () => {
    const persistence = new RecordingGraphAdapter();
    const writerRef = buildWriterRef(GRAPH_NAME, WRITER_ID);
    const builder = createBuilder(persistence);

    builder.addNode('node:visible');
    const sha = await builder.commit();

    expect(persistence.casUpdates).toEqual([{
      ref: writerRef,
      newOid: sha,
      expectedOid: null,
    }]);
    expect(await persistence.readRef(writerRef)).toBe(sha);
  });

  it('rejects success when the post-CAS writer ref does not name the returned commit', async () => {
    const persistence = new DriftAfterCasGraphAdapter();
    const builder = createBuilder(persistence);

    builder.addNode('node:drift');

    await expect(builder.commit()).rejects.toMatchObject({
      code: 'WRITER_COMMIT_NOT_VISIBLE',
    });
  });

  it('preserves post-CAS visibility errors through Writer patch sessions', async () => {
    const persistence = new DriftAfterCasGraphAdapter();
    const graph = await openRuntimeHostProduct({
      persistence,
      graphName: GRAPH_NAME,
      writerId: WRITER_ID,
      autoMaterialize: true,
    });
    const writer = await graph.writer(WRITER_ID);

    await expect(writer.commitPatch((patch) => {
      patch.addNode('node:writer-drift');
    })).rejects.toMatchObject({
      code: 'WRITER_COMMIT_NOT_VISIBLE',
    });
  });

  it('makes the returned patch commit visible through graph materialization', async () => {
    const persistence = new RecordingGraphAdapter();
    const graph = await openRuntimeHostProduct({
      persistence,
      graphName: GRAPH_NAME,
      writerId: WRITER_ID,
      autoMaterialize: true,
    });
    const writerRef = buildWriterRef(GRAPH_NAME, WRITER_ID);

    const sha = await graph.patch((patch) => {
      patch.addNode('node:materialized');
    });

    expect(await persistence.readRef(writerRef)).toBe(sha);
    await graph.materialize();
    expect(await graph.hasNode('node:materialized')).toBe(true);
  });
});
