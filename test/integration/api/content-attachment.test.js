import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { createTestRepo } from './helpers/setup.js';

describe('API: Content Attachment', () => {
  /** @type {any} */
  let repo;

  beforeEach(async () => {
    repo = await createTestRepo('content');
  });

  afterEach(async () => {
    await repo?.cleanup();
  });

  it('attach → materialize → getContent returns exact buffer', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const patch = await graph.createPatch();
    patch.addNode('doc:1');
    await patch.attachContent('doc:1', '# Hello World\n\nThis is content.');
    await patch.commit();

    await graph.materialize();
    const content = await graph.getContent('doc:1');
    expect(content).not.toBeNull();
    expect(content.toString('utf8')).toBe('# Hello World\n\nThis is content.');
  });

  it('getContentOid returns hex OID', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const patch = await graph.createPatch();
    patch.addNode('doc:1');
    await patch.attachContent('doc:1', 'test content');
    await patch.commit();

    await graph.materialize();
    const oid = await graph.getContentOid('doc:1');
    expect(oid).not.toBeNull();
    // Support both SHA-1 (40 chars) and SHA-256 (64 chars)
    expect(oid).toMatch(/^[0-9a-f]+$/);
    expect(oid.length).toBeGreaterThanOrEqual(40);
  });

  it('returns null when no content attached', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const patch = await graph.createPatch();
    patch.addNode('doc:1').setProperty('doc:1', 'title', 'No content');
    await patch.commit();

    await graph.materialize();
    expect(await graph.getContent('doc:1')).toBeNull();
    expect(await graph.getContentOid('doc:1')).toBeNull();
  });

  it('returns null for nonexistent node', async () => {
    const graph = await repo.openGraph('test', 'alice');
    await graph.materialize();

    expect(await graph.getContent('nonexistent')).toBeNull();
    expect(await graph.getContentOid('nonexistent')).toBeNull();
  });

  it('edge content: attach and retrieve via getEdgeContent', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const p1 = await graph.createPatch();
    p1.addNode('a').addNode('b').addEdge('a', 'b', 'rel');
    await p1.attachEdgeContent('a', 'b', 'rel', 'edge payload');
    await p1.commit();

    await graph.materialize();
    const content = await graph.getEdgeContent('a', 'b', 'rel');
    expect(content).not.toBeNull();
    expect(content.toString('utf8')).toBe('edge payload');

    const oid = await graph.getEdgeContentOid('a', 'b', 'rel');
    expect(oid).toMatch(/^[0-9a-f]+$/);
  });

  it('multi-writer LWW: concurrent attachments resolve deterministically', async () => {
    const graph1 = await repo.openGraph('test', 'alice');
    const graph2 = await repo.openGraph('test', 'bob');

    // Alice creates the node
    const p1 = await graph1.createPatch();
    p1.addNode('doc:shared');
    await p1.attachContent('doc:shared', 'alice version');
    await p1.commit();

    // Bob sees the node via materialize, then attaches different content
    await graph2.materialize();
    const p2 = await graph2.createPatch();
    await p2.attachContent('doc:shared', 'bob version');
    await p2.commit();

    // Materialize from both writers — LWW resolves deterministically
    await graph1.materialize();
    const content = await graph1.getContent('doc:shared');
    expect(content).not.toBeNull();

    // Bob's content should win (higher Lamport tick)
    expect(content.toString('utf8')).toBe('bob version');
  });

  it('time-travel: materialize with ceiling returns historical content', async () => {
    const graph = await repo.openGraph('test', 'alice');

    // Tick 1: attach v1
    const p1 = await graph.createPatch();
    p1.addNode('doc:1');
    await p1.attachContent('doc:1', 'version 1');
    await p1.commit();

    // Tick 2: update to v2
    await graph.materialize();
    const p2 = await graph.createPatch();
    await p2.attachContent('doc:1', 'version 2');
    await p2.commit();

    // Latest should be v2
    await graph.materialize();
    const latest = await graph.getContent('doc:1');
    expect(latest.toString('utf8')).toBe('version 2');

    // Ceiling=1 should be v1
    await graph.materialize({ ceiling: 1 });
    const historical = await graph.getContent('doc:1');
    expect(historical.toString('utf8')).toBe('version 1');
  });

  it('node deletion removes content reference', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const p1 = await graph.createPatch();
    p1.addNode('doc:1');
    await p1.attachContent('doc:1', 'soon to be deleted');
    await p1.commit();

    await graph.materialize();
    expect(await graph.getContent('doc:1')).not.toBeNull();

    const p2 = await graph.createPatch();
    p2.removeNode('doc:1');
    await p2.commit();

    await graph.materialize();
    // After removing the node, getContent returns null (node not alive)
    expect(await graph.getContent('doc:1')).toBeNull();
  });

  it('writer API: commitPatch with attachContent', async () => {
    const graph = await repo.openGraph('test', 'alice');
    const writer = await graph.writer();

    await writer.commitPatch(async (/** @type {any} */ p) => {
      p.addNode('doc:1');
      await p.attachContent('doc:1', 'via writer API');
    });

    await graph.materialize();
    const content = await graph.getContent('doc:1');
    expect(content.toString('utf8')).toBe('via writer API');
  });

  it('GC durability: content survives git gc --prune=now', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const p1 = await graph.createPatch();
    p1.addNode('doc:1');
    await p1.attachContent('doc:1', 'must survive gc');
    await p1.commit();

    // Run aggressive GC in the test repo
    execSync('git gc --prune=now', { cwd: repo.tempDir, stdio: 'pipe' });

    // Content should still be retrievable (blob is anchored in commit tree)
    await graph.materialize();
    const content = await graph.getContent('doc:1');
    expect(content).not.toBeNull();
    expect(content.toString('utf8')).toBe('must survive gc');
  });

  it('checkpoint anchoring: content survives GC after checkpoint', async () => {
    const graph = await repo.openGraph('test', 'alice');

    // Attach content and commit
    const p1 = await graph.createPatch();
    p1.addNode('doc:1');
    await p1.attachContent('doc:1', 'checkpointed content');
    await p1.commit();

    // Materialize + create checkpoint (anchors content blob in checkpoint tree)
    await graph.materialize();
    await graph.createCheckpoint();

    // Aggressive GC — would nuke loose blobs not reachable from any ref
    execSync('git gc --prune=now', { cwd: repo.tempDir, stdio: 'pipe' });

    // Re-open graph (fresh instance, no cached state)
    const graph2 = await repo.openGraph('test', 'alice');
    await graph2.materialize();
    const content = await graph2.getContent('doc:1');
    expect(content).not.toBeNull();
    expect(content.toString('utf8')).toBe('checkpointed content');
  });

  it('binary content round-trips correctly', async () => {
    const graph = await repo.openGraph('test', 'alice');
    const binary = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);

    const patch = await graph.createPatch();
    patch.addNode('bin:1');
    await patch.attachContent('bin:1', binary);
    await patch.commit();

    await graph.materialize();
    const content = await graph.getContent('bin:1');
    expect(content).not.toBeNull();
    expect(Buffer.compare(content, binary)).toBe(0);
  });
});
