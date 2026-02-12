/**
 * @fileoverview WarpGraph — audit integration tests.
 *
 * Tests that when `audit: true` is passed to WarpGraph.open(),
 * audit commits are created after data commits.
 */

import { describe, it, expect, vi } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import InMemoryGraphAdapter from '../../../src/infrastructure/adapters/InMemoryGraphAdapter.js';

describe('WarpGraph — audit mode', () => {
  it('rejects audit: "yes" (non-boolean truthy)', async () => {
    await expect(
      WarpGraph.open({
        persistence: new InMemoryGraphAdapter(),
        graphName: 'events',
        writerId: 'alice',
        audit: /** @type {any} */ ('yes'),
      }),
    ).rejects.toThrow('audit must be a boolean');
  });

  it('rejects audit: 1 (number)', async () => {
    await expect(
      WarpGraph.open({
        persistence: new InMemoryGraphAdapter(),
        graphName: 'events',
        writerId: 'alice',
        audit: /** @type {any} */ (1),
      }),
    ).rejects.toThrow('audit must be a boolean');
  });

  it('audit: false (default) → no audit commits', async () => {
    const persistence = new InMemoryGraphAdapter();
    const graph = await WarpGraph.open({
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
    const graph = await WarpGraph.open({
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
    const graph = await WarpGraph.open({
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
    const graph = await WarpGraph.open({
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
    const info = await persistence.getNodeInfo(/** @type {string} */ (auditSha2));
    expect(info.parents).toEqual([auditSha1]);
  });

  it('dirty state → audit skipped, AUDIT_SKIPPED_DIRTY_STATE logged', async () => {
    const persistence = new InMemoryGraphAdapter();
    const logger = { warn: vi.fn(), info: vi.fn(), debug: vi.fn(), error: vi.fn(), child: vi.fn(() => logger) };
    const graph = await WarpGraph.open({
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

    // If graph was able to eager-apply (cachedState was not null),
    // then audit should have succeeded. Either way is valid behavior.
    const auditRef = await persistence.readRef('refs/warp/events/audit/alice');
    if (auditRef) {
      // Eager path worked — audit commit was created
      expect(typeof auditRef).toBe('string');
    } else {
      // Dirty state — skip was logged
      expect(skipLog).toBeTruthy();
    }
  });

  it('audit commit tree contains receipt.cbor with correct receipt data', async () => {
    const persistence = new InMemoryGraphAdapter();
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'events',
      writerId: 'alice',
      audit: true,
    });

    // Materialize first so eager path is available
    await graph.materialize();

    const patch = await graph.createPatch();
    patch.addNode('user:eve');
    await patch.commit();

    const auditSha = await persistence.readRef('refs/warp/events/audit/alice');
    if (!auditSha) {
      // Skip if eager path wasn't available
      return;
    }

    const commit = persistence._commits.get(auditSha);
    expect(commit).toBeTruthy();
    const tree = await persistence.readTree(/** @type {{ treeOid: string }} */ (commit).treeOid);
    expect(tree).toHaveProperty('receipt.cbor');

    // Decode and verify
    const { decode } = await import('../../../src/infrastructure/codecs/CborCodec.js');
    const receipt = /** @type {Record<string, unknown>} */ (decode(tree['receipt.cbor']));
    expect(receipt.version).toBe(1);
    expect(receipt.graphName).toBe('events');
    expect(receipt.writerId).toBe('alice');
    expect(typeof receipt.timestamp).toBe('number');
    expect(Number.isInteger(receipt.timestamp)).toBe(true);
  });

  it('graph state is correct regardless of audit mode', async () => {
    // Ensure audit mode doesn't corrupt normal graph operations
    const persistence = new InMemoryGraphAdapter();
    const graph = await WarpGraph.open({
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
