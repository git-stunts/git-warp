import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openMemoryRuntimeHostProduct as openRuntimeHostProduct } from '../../helpers/MemoryRuntimeHost.ts';
import { buildWriterRef } from '../../../src/domain/utils/RefLayout.ts';
import InMemoryGraphAdapter from '../../helpers/InMemoryGraphAdapter.ts';

/**
 * AP/INVAL/3 — Writer.commitPatch() and PatchSession.commit() trigger
 * the same eager re-materialize as the low-level createPatch() API.
 *
 * The Writer and PatchSession are higher-level APIs that delegate to
 * PatchBuilder. The onCommitSuccess callback wired in WarpCore.writer()
 * must trigger eager state update so that queries after a writer commit
 * reflect the new state immediately.
 */

describe('WarpCore Writer invalidation (AP/INVAL/3)', () => {
  let persistence: InMemoryGraphAdapter;
  let graph: Awaited<ReturnType<typeof openRuntimeHostProduct>>;

  beforeEach(async () => {
    persistence = new InMemoryGraphAdapter();
    graph = await openRuntimeHostProduct({
      persistence,
      graphName: 'test',
      writerId: 'writer-1',
    });
  });

  // ── writer.commitPatch() golden path ─────────────────────────────

  it('writer.commitPatch() followed by hasNode() returns true without explicit re-materialize', async () => {
    await graph.materialize();

    const writer = await graph.writer('writer-1');
    await writer.commitPatch((patch) => {
      patch.addNode('test:node');
    });

    // Query reflects the commit immediately — no explicit materialize needed
    expect(await graph.hasNode('test:node')).toBe(true);
    expect((graph)._stateDirty).toBe(false);
  });

  it('writer.commitPatch() keeps _stateDirty false when _cachedState exists', async () => {
    await graph.materialize();
    expect((graph)._stateDirty).toBe(false);

    const writer = await graph.writer('writer-1');
    await writer.commitPatch((patch) => {
      patch.addNode('test:node');
    });

    // Eager re-materialize applied the patch, so state is fresh
    expect((graph)._stateDirty).toBe(false);
  });

  // ── writer.beginPatch() / patch.commit() two-step API ────────────

  it('beginPatch() + patch.commit() followed by hasNode() returns true', async () => {
    await graph.materialize();

    const writer = await graph.writer('writer-1');
    const patch = await writer.beginPatch();
    patch.addNode('test:node');
    await patch.commit();

    expect(await graph.hasNode('test:node')).toBe(true);
    expect((graph)._stateDirty).toBe(false);
  });

  it('beginPatch() + setProperty reflected in getNodeProps() after commit', async () => {
    await graph.materialize();

    const writer = await graph.writer('writer-1');
    const patch = await writer.beginPatch();
    patch.addNode('test:node');
    patch.setProperty('test:node', 'name', 'Alice');
    await patch.commit();

    const props = await graph.getNodeProps('test:node');
    expect(props).not.toBeNull();
    expect(props?.['name']).toBe('Alice');
  });

  // ── Multiple sequential writer commits ───────────────────────────

  it('multiple sequential writer commits keep state fresh', async () => {
    await graph.materialize();

    const writer = await graph.writer('writer-1');
    await writer.commitPatch((patch) => {
      patch.addNode('test:a');
    });
    expect((graph)._stateDirty).toBe(false);
    expect(await graph.hasNode('test:a')).toBe(true);

    const writer2 = await graph.writer('writer-1');
    await writer2.commitPatch((patch) => {
      patch.addNode('test:b');
    });
    expect((graph)._stateDirty).toBe(false);
    expect(await graph.hasNode('test:b')).toBe(true);

    // Both nodes should be present
    expect(await graph.hasNode('test:a')).toBe(true);
  });

  // ── writer commit without prior materialize ──────────────────────

  it('writer commit without prior materialize sets _stateDirty to true', async () => {
    // No materialize() call — _cachedState is null
    const writer = await graph.writer('writer-1');
    await writer.commitPatch((patch) => {
      patch.addNode('test:node');
    });

    // No _cachedState, so can't eagerly apply — dirty
    expect((graph)._stateDirty).toBe(true);
  });

  // ── writer(id) path ──────────────────────────────────────────

  it('writer(id) path also triggers eager invalidation', async () => {
    await graph.materialize();

    const writer = await graph.writer('fresh-writer');

    await writer.commitPatch((patch) => {
      patch.addNode('test:node');
    });

    expect(await graph.hasNode('test:node')).toBe(true);
    expect((graph)._stateDirty).toBe(false);
  });

  // ── Failure cases ────────────────────────────────────────────────

  it('writer commit failure (writeBlob rejects) does not corrupt state', async () => {
    await graph.materialize();
    const stateBeforeAttempt = (graph)._cachedState;

    vi.spyOn(persistence, 'writeBlob').mockRejectedValueOnce(new Error('disk full'));

    const writer = await graph.writer('writer-1');
    await expect(writer.commitPatch((patch) => {
      patch.addNode('test:node');
    })).rejects.toThrow('disk full');

    // State should be unchanged
    expect((graph)._stateDirty).toBe(false);
    expect((graph)._cachedState).toBe(stateBeforeAttempt);
  });

  it('writer commit failure (compareAndSwapRef rejects) does not corrupt state', async () => {
    await graph.materialize();
    const stateBeforeAttempt = (graph)._cachedState;

    vi.spyOn(persistence, 'compareAndSwapRef').mockRejectedValueOnce(new Error('ref lock failed'));

    const writer = await graph.writer('writer-1');
    await expect(writer.commitPatch((patch) => {
      patch.addNode('test:node');
    })).rejects.toThrow('ref lock failed');

    expect((graph)._stateDirty).toBe(false);
    expect((graph)._cachedState).toBe(stateBeforeAttempt);
  });

  it('writer commit failure (CAS race in PatchSession) does not corrupt state', async () => {
    await graph.materialize();
    const stateBeforeAttempt = (graph)._cachedState;

    const writer = await graph.writer('writer-1');
    const patch = await writer.beginPatch();
    patch.addNode('test:node');
    const concurrentSha = await persistence.commitNode({
      message: 'concurrent writer publication',
    });
    await persistence.updateRef(buildWriterRef('test', 'writer-1'), concurrentSha);

    await expect(patch.commit()).rejects.toThrow();

    expect((graph)._stateDirty).toBe(false);
    expect((graph)._cachedState).toBe(stateBeforeAttempt);
  });
});
