import { describe, expect, it } from 'vitest';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { encodeEdgeKey } from '../../../../src/domain/services/JoinReducer.ts';
import AssetHandle from '../../../../src/domain/storage/AssetHandle.ts';
import { createGitCasPatchStorage } from '../../../../src/ports/CommitMessageCodecPort.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import {
  createPatchBuilder,
  createPatchBuilderMockPersistence as createMockPersistence,
  createPatchJournal,
} from './PatchBuilderTestHarness.ts';

describe('PatchBuilder semantic commit', () => {
  it('publishes one causal patch request and returns its commit identity', async () => {
    const persistence = createMockPersistence();
    const patchJournal = createPatchJournal(persistence);
    const builder = createPatchBuilder({
      persistence,
      patchJournal,
      graphName: 'events',
      writerId: 'writer-1',
      lamport: 1,
    });
    builder.addNode('node:a').setProperty('node:a', 'status', 'open');

    await expect(builder.commit()).resolves.toBe('c'.repeat(40));

    expect(patchJournal.requests).toHaveLength(1);
    expect(patchJournal.requests[0]).toMatchObject({
      graph: 'events',
      writer: 'writer-1',
      targetRef: 'refs/warp/events/writers/writer-1',
      expectedHead: null,
      parent: null,
      attachments: [],
      patch: {
        schema: 2,
        writer: 'writer-1',
        lamport: 1,
        writes: ['node:a'],
      },
    });
  });

  it('returns publication retention evidence from commitWithEvidence()', async () => {
    const persistence = createMockPersistence();
    const patchJournal = createPatchJournal(persistence);
    const builder = createPatchBuilder({ persistence, patchJournal });
    builder.addNode('node:a');

    const result = await builder.commitWithEvidence();

    expect(result.sha).toBe('c'.repeat(40));
    expect(result.bundleHandle.toString()).toBe('bundle:test-patch');
    expect(result.retention).toMatchObject({
      policy: 'pinned',
      reachability: 'anchored',
      root: { kind: 'publication' },
    });
    expect(result.patch.ops).toHaveLength(1);
  });

  it('rejects empty patches before calling storage', async () => {
    const persistence = createMockPersistence();
    const patchJournal = createPatchJournal(persistence);
    const builder = createPatchBuilder({ persistence, patchJournal });

    await expect(builder.commit()).rejects.toMatchObject({ code: 'E_PATCH_EMPTY' });
    expect(patchJournal.requests).toEqual([]);
  });

  it('advances lamport time and forwards the existing causal parent', async () => {
    const parent = 'd'.repeat(40);
    const persistence = createMockPersistence({
      readRef: createMockPersistence().readRef.mockResolvedValue(parent),
      showNode: createMockPersistence().showNode.mockResolvedValue(
        DEFAULT_COMMIT_MESSAGE_CODEC.encodePatch({
          kind: 'patch',
          graph: 'events',
          writer: 'writer-1',
          lamport: 5,
          schema: 2,
          patchHandle: new AssetHandle('asset:parent'),
          storage: createGitCasPatchStorage({ encrypted: false }),
        }),
      ),
    });
    const patchJournal = createPatchJournal(persistence);
    const builder = createPatchBuilder({
      persistence,
      patchJournal,
      graphName: 'events',
      writerId: 'writer-1',
      lamport: 1,
      expectedParentSha: parent,
    });
    builder.addNode('node:a');

    await builder.commit();

    expect(patchJournal.requests[0]).toMatchObject({
      expectedHead: parent,
      parent,
      patch: { lamport: 6 },
    });
  });

  it('preserves attachment handles in the publication request', async () => {
    const persistence = createMockPersistence();
    const patchJournal = createPatchJournal(persistence);
    const builder = createPatchBuilder({ persistence, patchJournal });
    builder.addNode('node:a');
    (builder as unknown as { _contentAssets: AssetHandle[] })._contentAssets.push(
      new AssetHandle('asset:attachment'),
    );

    await builder.commit();

    expect(patchJournal.requests[0]?.attachments.map(String)).toEqual(['asset:attachment']);
  });

  it('blocks mutation and repeat publication after a successful commit', async () => {
    const persistence = createMockPersistence();
    const patchJournal = createPatchJournal(persistence);
    const builder = createPatchBuilder({ persistence, patchJournal });
    builder.addNode('node:a');
    await builder.commit();

    expect(() => builder.addNode('node:b')).toThrow(/already committed/u);
    await expect(builder.attachContent('node:a', 'payload')).rejects.toThrow(/already committed/u);
    await expect(builder.commit()).rejects.toThrow(/already committed/u);
    expect(patchJournal.requests).toHaveLength(1);
  });

  it('blocks mutation while publication is in flight', async () => {
    let releaseRead: (head: string | null) => void = () => {};
    const read = new Promise<string | null>((resolve) => {
      releaseRead = resolve;
    });
    const persistence = createMockPersistence();
    persistence.readRef.mockImplementation(async () => await read);
    const patchJournal = createPatchJournal(persistence);
    const builder = createPatchBuilder({ persistence, patchJournal });
    builder.addNode('node:a');

    const pending = builder.commit();
    expect(() => builder.addNode('node:b')).toThrow(/already committed/u);
    await expect(builder.commit()).rejects.toThrow(/already committed/u);
    releaseRead(null);
    await expect(pending).resolves.toBe('c'.repeat(40));
  });

  it('allows retry after a storage failure', async () => {
    const persistence = createMockPersistence();
    const patchJournal = createPatchJournal(persistence);
    patchJournal.failure = new Error('publication unavailable');
    const builder = createPatchBuilder({ persistence, patchJournal });
    builder.addNode('node:a');

    await expect(builder.commit()).rejects.toThrow('publication unavailable');
    patchJournal.failure = null;
    await expect(builder.commit()).resolves.toBe('c'.repeat(40));
  });

  it('keeps read and write sets observable after publication', async () => {
    const persistence = createMockPersistence();
    const builder = createPatchBuilder({
      persistence,
      patchJournal: createPatchJournal(persistence),
      versionVector: VersionVector.empty(),
    });
    builder.addEdge('user:alice', 'user:bob', 'follows');
    await builder.commit();

    expect(builder.reads).toEqual(new Set(['user:alice', 'user:bob']));
    expect(builder.writes).toEqual(new Set([
      encodeEdgeKey('user:alice', 'user:bob', 'follows'),
    ]));
  });
});
