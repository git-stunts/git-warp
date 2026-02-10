import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestRepo } from './helpers/setup.js';

describe('API: Checkpoint', () => {
  /** @type {any} */
  let repo;

  beforeEach(async () => {
    repo = await createTestRepo('checkpoint');
  });

  afterEach(async () => {
    await repo?.cleanup();
  });

  it('creates a checkpoint and returns a valid SHA', async () => {
    const graph = await repo.openGraph('test', 'writer1');

    await (await graph.createPatch()).addNode('n1').commit();
    await (await graph.createPatch()).addNode('n2').commit();
    await graph.materialize();

    const sha = await graph.createCheckpoint();
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it('materializeAt restores state from checkpoint', async () => {
    const graph = await repo.openGraph('test', 'writer1');

    await (await graph.createPatch()).addNode('n1').commit();
    await (await graph.createPatch()).addNode('n2').commit();
    await graph.materialize();

    const sha = await graph.createCheckpoint();

    // Add more data after checkpoint
    await (await graph.createPatch()).addNode('n3').commit();

    // materializeAt restores checkpoint base and applies patches up to tips
    const state = await graph.materializeAt(sha);
    expect(state).toBeDefined();
    const nodes = await graph.getNodes();
    expect(nodes).toContain('n1');
    expect(nodes).toContain('n2');
  });

  it('incremental checkpoint after additional patches', async () => {
    const graph = await repo.openGraph('test', 'writer1');

    await (await graph.createPatch()).addNode('a').commit();
    await graph.materialize();
    const sha1 = await graph.createCheckpoint();

    await (await graph.createPatch()).addNode('b').commit();
    await graph.materialize();
    const sha2 = await graph.createCheckpoint();

    expect(sha1).not.toBe(sha2);
    expect(sha2).toMatch(/^[0-9a-f]{40}$/);
  });
});
