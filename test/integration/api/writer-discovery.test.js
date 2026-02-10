import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createTestRepo } from './helpers/setup.js';

describe('API: Writer Discovery', () => {
  /** @type {any} */
  let repo;

  beforeEach(async () => {
    repo = await createTestRepo('writer-discovery');
  });

  afterEach(async () => {
    await repo?.cleanup();
  });

  it('discovers writers after multi-writer writes', async () => {
    const alice = await repo.openGraph('test', 'alice');
    const bob = await repo.openGraph('test', 'bob');

    await (await alice.createPatch()).addNode('a').commit();
    await (await bob.createPatch()).addNode('b').commit();

    const writers = await alice.discoverWriters();
    expect(writers.sort()).toEqual(['alice', 'bob']);
  });

  it('getWriterPatches returns patches for a specific writer', async () => {
    const alice = await repo.openGraph('test', 'alice');

    await (await alice.createPatch()).addNode('n1').commit();
    await (await alice.createPatch()).addNode('n2').commit();

    const patches = await alice.getWriterPatches('alice');
    expect(patches).toHaveLength(2);
  });

  it('getWriterPatches returns empty for unknown writer', async () => {
    const alice = await repo.openGraph('test', 'alice');
    await (await alice.createPatch()).addNode('n1').commit();

    const patches = await alice.getWriterPatches('unknown');
    expect(patches).toHaveLength(0);
  });

  it('status returns frontier with all writers', async () => {
    const alice = await repo.openGraph('test', 'alice');
    const bob = await repo.openGraph('test', 'bob');

    await (await alice.createPatch()).addNode('a').commit();
    await (await bob.createPatch()).addNode('b').commit();
    await alice.materialize();

    const status = await alice.status();
    expect(status.frontier).toBeDefined();
    expect(Object.keys(status.frontier).sort()).toEqual(['alice', 'bob']);
  });

  it('syncCoverage creates coverage anchor', async () => {
    const alice = await repo.openGraph('test', 'alice');
    const bob = await repo.openGraph('test', 'bob');

    await (await alice.createPatch()).addNode('a').commit();
    await (await bob.createPatch()).addNode('b').commit();

    await alice.syncCoverage();

    const coverageSha = await repo.persistence.readRef('refs/warp/test/coverage/head');
    expect(coverageSha).toBeTruthy();
  });
});
