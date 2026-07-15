/**
 * @fileoverview WarpCore — audit integration tests.
 *
 * Tests that when `audit: true` is passed to openRuntimeHostProduct(),
 * audit commits are created after data commits.
 */

import { describe, it, expect, vi } from 'vitest';
import { openMemoryRuntimeHostProduct as openRuntimeHostProduct } from '../../helpers/MemoryRuntimeHost.ts';
import InMemoryGraphAdapter from '../../../test/helpers/InMemoryGraphAdapter.ts';
import MemoryRuntimeStorageAdapter from '../../helpers/MemoryRuntimeStorageAdapter.ts';
import defaultCodec, { decode } from '../../../src/infrastructure/codecs/CborCodec.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';

describe('WarpCore — audit mode', () => {
  it('rejects audit: "yes" (non-boolean truthy)', async () => {
    await expect(
      openRuntimeHostProduct({
        persistence: new InMemoryGraphAdapter(),
        graphName: 'events',
        writerId: 'alice',
        audit: ('yes' as any),
      }),
    ).rejects.toThrow('audit must be a boolean');
  });

  it('rejects audit: 1 (number)', async () => {
    await expect(
      openRuntimeHostProduct({
        persistence: new InMemoryGraphAdapter(),
        graphName: 'events',
        writerId: 'alice',
        audit: (1 as any),
      }),
    ).rejects.toThrow('audit must be a boolean');
  });

  it('audit: false (default) → no audit commits', async () => {
    const persistence = new InMemoryGraphAdapter();
    const graph = await openRuntimeHostProduct({
      persistence,
      graphName: 'events',
      writerId: 'alice',
    });

    const patch = await graph.createPatch();
    patch.addNode('user:alice');
    await patch.commit();

    // No audit ref should exist
    const auditRef = await persistence.readRef('refs/warp/events/audit/alice');
    expect(auditRef).toBeNull();
  });

  it('audit: true → audit commit after data commit', async () => {
    const persistence = new InMemoryGraphAdapter();
    const graph = await openRuntimeHostProduct({
      persistence,
      graphName: 'events',
      writerId: 'alice',
      audit: true,
    });

    // Materialize to seed the eager cache
    await graph.materialize();

    const patch = await graph.createPatch();
    patch.addNode('user:alice');
    await patch.commit();

    // Audit ref should be set
    const auditRef = await persistence.readRef('refs/warp/events/audit/alice');
    expect(auditRef).toBeTruthy();
    expect(typeof auditRef).toBe('string');
  });

  it('audit ref advances correctly on multiple commits', async () => {
    const persistence = new InMemoryGraphAdapter();
    const graph = await openRuntimeHostProduct({
      persistence,
      graphName: 'events',
      writerId: 'alice',
      audit: true,
    });

    await graph.materialize();

    const patch1 = await graph.createPatch();
    patch1.addNode('user:alice');
    await patch1.commit();
    const auditRef1 = await persistence.readRef('refs/warp/events/audit/alice');

    const patch2 = await graph.createPatch();
    patch2.addNode('user:bob');
    await patch2.commit();
    const auditRef2 = await persistence.readRef('refs/warp/events/audit/alice');

    expect(auditRef1).toBeTruthy();
    expect(auditRef2).toBeTruthy();
    expect(auditRef2).not.toBe(auditRef1);
  });

  it('multiple commits form valid chain (parent linking)', async () => {
    const persistence = new InMemoryGraphAdapter();
    const graph = await openRuntimeHostProduct({
      persistence,
      graphName: 'events',
      writerId: 'alice',
      audit: true,
    });

    await graph.materialize();

    const patch1 = await graph.createPatch();
    patch1.addNode('user:alice');
    await patch1.commit();
    const auditSha1 = await persistence.readRef('refs/warp/events/audit/alice');

    const patch2 = await graph.createPatch();
    patch2.addNode('user:bob');
    await patch2.commit();
    const auditSha2 = await persistence.readRef('refs/warp/events/audit/alice');

    // Second audit commit should have first as parent
    const info = await persistence.getNodeInfo((auditSha2 as string));
    expect(info.parents).toEqual([auditSha1]);
  });

  it('dirty state → audit skipped, AUDIT_SKIPPED_DIRTY_STATE logged', async () => {
    const persistence = new InMemoryGraphAdapter();
    const logger = { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn(), child: vi.fn(() => logger) };
    const graph = await openRuntimeHostProduct({
      persistence,
      graphName: 'events',
      writerId: 'alice',
      audit: true,
      logger,
    });

    // Force dirty state by not materializing first
    // The graph starts with no cached state, so _cachedState is null
    // which means the eager path is skipped → dirty state
    const patch = await graph.createPatch();
    patch.addNode('user:alice');
    await patch.commit();

    // Check if dirty-state logging happened.
    // With a fresh graph (no prior materialize), _cachedState is null,
    // so the else branch fires.
    const skipLog = logger.warn.mock.calls.find(
      (c) => c[1]?.code === 'AUDIT_SKIPPED_DIRTY_STATE',
    );

    const auditRef = await persistence.readRef('refs/warp/events/audit/alice');
    expect(auditRef).toBeNull();
    expect(skipLog).toBeTruthy();
  });

  it('audit commit tree contains receipt.cbor with correct receipt data', async () => {
    const persistence = new InMemoryGraphAdapter();
    const runtimeStorage = new MemoryRuntimeStorageAdapter({ history: persistence });
    const storage = await runtimeStorage.createRuntimeStorageServices({
      timelineName: 'events',
      codec: defaultCodec,
      commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
    });
    const graph = await openRuntimeHostProduct({
      persistence,
      runtimeStorage,
      graphName: 'events',
      writerId: 'alice',
      audit: true,
    });

    // Materialize first so eager path is available
    await graph.materialize();

    const patch = await graph.createPatch();
    patch.addNode('user:eve');
    await patch.commit();

    const auditSha = await storage.auditLog.readHead('events', 'alice');
    if (!auditSha) {
      throw new Error('audit ref must exist after audited commit');
    }

    const entry = await storage.auditLog.readEntry(auditSha);
    const receipt = decode(entry.receipt);
    expect(receipt).toMatchObject({
      version: 1,
      graphName: 'events',
      writerId: 'alice',
      timestamp: expect.any(Number),
    });
    if (!isRecord(receipt) || typeof receipt['timestamp'] !== 'number') {
      throw new Error('decoded audit receipt must contain a numeric timestamp');
    }
    expect(Number.isInteger(receipt['timestamp'])).toBe(true);
  });

  it('graph state is correct regardless of audit mode', async () => {
    // Ensure audit mode doesn't corrupt normal graph operations
    const persistence = new InMemoryGraphAdapter();
    const graph = await openRuntimeHostProduct({
      persistence,
      graphName: 'events',
      writerId: 'alice',
      audit: true,
    });

    await graph.materialize();

    const patch = await graph.createPatch();
    patch.addNode('user:alice');
    patch.setProperty('user:alice', 'name', 'Alice');
    await patch.commit();

    await graph.materialize();
    const hasAlice = await graph.hasNode('user:alice');
    expect(hasAlice).toBe(true);
  });
});

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
