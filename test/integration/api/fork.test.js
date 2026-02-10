import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestRepo } from './helpers/setup.js';

describe('API: Fork', () => {
  /** @type {any} */
  let repo;

  beforeEach(async () => {
    repo = await createTestRepo('fork');
  });

  afterEach(async () => {
    await repo?.cleanup();
  });

  it('forks a graph and both evolve independently', async () => {
    const graph = await repo.openGraph('original', 'alice');

    const sha1 = await (await graph.createPatch())
      .addNode('shared')
      .setProperty('shared', 'origin', 'original')
      .commit();

    await graph.materialize();

    // Fork at the first patch — fork() returns a usable WarpGraph
    const forkedGraph = await graph.fork({
      from: 'alice',
      at: sha1,
      forkName: 'forked',
      forkWriterId: 'fork-writer',
    });

    // Add to original
    await (await graph.createPatch())
      .addNode('original-only')
      .commit();

    // Add to fork (using returned graph directly — no re-open needed)
    await (await forkedGraph.createPatch())
      .addNode('fork-only')
      .commit();

    // Verify original has shared + original-only
    await graph.materialize();
    const origNodes = await graph.getNodes();
    expect(origNodes).toContain('shared');
    expect(origNodes).toContain('original-only');
    expect(origNodes).not.toContain('fork-only');

    // Verify fork has shared + fork-only
    await forkedGraph.materialize();
    const forkNodes = await forkedGraph.getNodes();
    expect(forkNodes).toContain('shared');
    expect(forkNodes).toContain('fork-only');
    expect(forkNodes).not.toContain('original-only');
  });

  it('fork() returns a writable WarpGraph instance', async () => {
    const graph = await repo.openGraph('src', 'writer-a');

    const sha = await (await graph.createPatch())
      .addNode('root')
      .commit();

    await graph.materialize();

    const forked = await graph.fork({
      from: 'writer-a',
      at: sha,
      forkName: 'dst',
      forkWriterId: 'writer-b',
    });

    // Return value must be a WarpGraph that supports immediate writes
    await (await forked.createPatch())
      .addNode('new-node')
      .setProperty('new-node', 'added-by', 'fork-return')
      .commit();

    await forked.materialize();
    const nodes = await forked.getNodes();
    expect(nodes).toContain('root');
    expect(nodes).toContain('new-node');

    const props = await forked.getNodeProps('new-node');
    expect(props.get('added-by')).toBe('fork-return');
  });
});
