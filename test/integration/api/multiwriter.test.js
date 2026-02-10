import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestRepo } from './helpers/setup.js';
import { computeStateHashV5 } from '../../../src/domain/services/StateSerializerV5.js';

describe('API: Multi-Writer', () => {
  /** @type {any} */
  let repo;

  beforeEach(async () => {
    repo = await createTestRepo('multiwriter');
  });

  afterEach(async () => {
    await repo?.cleanup();
  });

  it('two writers create independent patches that merge', async () => {
    const alice = await repo.openGraph('shared', 'alice');
    const bob = await repo.openGraph('shared', 'bob');

    await (await alice.createPatch()).addNode('node:a').commit();
    await (await bob.createPatch()).addNode('node:b').commit();

    await alice.materialize();
    const nodes = await alice.getNodes();
    expect(nodes).toContain('node:a');
    expect(nodes).toContain('node:b');
  });

  it('three writers contribute concurrently', async () => {
    const alice = await repo.openGraph('g', 'alice');
    const bob = await repo.openGraph('g', 'bob');
    const charlie = await repo.openGraph('g', 'charlie');

    await (await alice.createPatch())
      .addNode('a')
      .setProperty('a', 'by', 'alice')
      .commit();

    await (await bob.createPatch())
      .addNode('b')
      .setProperty('b', 'by', 'bob')
      .commit();

    await (await charlie.createPatch())
      .addNode('c')
      .addEdge('a', 'b', 'link')
      .commit();

    await alice.materialize();
    const nodes = await alice.getNodes();
    expect(nodes).toHaveLength(3);
    expect(nodes).toContain('a');
    expect(nodes).toContain('b');
    expect(nodes).toContain('c');

    const edges = await alice.getEdges();
    expect(edges).toHaveLength(1);
  });

  it('CRDT merge is deterministic (same state hash regardless of observer)', async () => {
    const alice = await repo.openGraph('det', 'alice');
    const bob = await repo.openGraph('det', 'bob');

    await (await alice.createPatch())
      .addNode('x')
      .setProperty('x', 'v', 42)
      .commit();

    await (await bob.createPatch())
      .addNode('y')
      .setProperty('y', 'v', 99)
      .commit();

    const stateA = await alice.materialize();
    const stateB = await bob.materialize();

    const hashA = await computeStateHashV5(stateA, { crypto: repo.crypto });
    const hashB = await computeStateHashV5(stateB, { crypto: repo.crypto });

    expect(hashA).toBe(hashB);
  });

  it('discovers all writers', async () => {
    const alice = await repo.openGraph('disc', 'alice');
    await (await alice.createPatch()).addNode('a').commit();

    const bob = await repo.openGraph('disc', 'bob');
    await (await bob.createPatch()).addNode('b').commit();

    const charlie = await repo.openGraph('disc', 'charlie');
    await (await charlie.createPatch()).addNode('c').commit();

    const writers = await alice.discoverWriters();
    expect(writers.sort()).toEqual(['alice', 'bob', 'charlie']);
  });
});
