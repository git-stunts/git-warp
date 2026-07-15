import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'node:child_process';
import { AssetHandle as GitCasAssetHandle } from '@git-stunts/git-cas';
import { createTestRepo } from './helpers/setup.ts';
import PersistenceError from '../../../src/domain/errors/PersistenceError.ts';
import {
  DEFAULT_COMMIT_MESSAGE_CODEC,
} from '../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';

describe('API: Content Attachment', () => {
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
    expect(new TextDecoder().decode(content)).toBe('# Hello World\n\nThis is content.');
  });

  it('getContentHandle returns an opaque storage handle', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const patch = await graph.createPatch();
    patch.addNode('doc:1');
    await patch.attachContent('doc:1', 'test content');
    await patch.commit();

    await graph.materialize();
    const handle = await graph.getContentHandle('doc:1');
    expect(handle).toEqual(expect.any(String));
    expect(handle).not.toBe('');
  });

  it('persists and reads content metadata for nodes', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const patch = await graph.createPatch();
    patch.addNode('doc:1');
    await patch.attachContent('doc:1', '# Title\n', {
      mime: 'text/markdown',
      size: 8,
    });
    await patch.commit();

    await graph.materialize();
    const meta = await graph.getContentMeta('doc:1');

    expect(meta).not.toBeNull();
    expect(meta).toMatchObject({
      mime: 'text/markdown',
      size: 8,
    });
    expect(meta?.handle).toEqual(expect.any(String));
  });

  it('returns null when no content attached', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const patch = await graph.createPatch();
    patch.addNode('doc:1').setProperty('doc:1', 'title', 'No content');
    await patch.commit();

    await graph.materialize();
    expect(await graph.getContent('doc:1')).toBeNull();
    expect(await graph.getContentHandle('doc:1')).toBeNull();
  });

  it('returns null for nonexistent node', async () => {
    const graph = await repo.openGraph('test', 'alice');
    await graph.materialize();

    expect(await graph.getContent('nonexistent')).toBeNull();
    expect(await graph.getContentHandle('nonexistent')).toBeNull();
  });

  it('clearContent removes node content and metadata through the public patch API', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const patch1 = await graph.createPatch();
    patch1.addNode('doc:1');
    await patch1.attachContent('doc:1', 'clear me', {
      mime: 'text/plain',
      size: 8,
    });
    await patch1.commit();

    await graph.materialize();
    expect(await graph.getContent('doc:1')).not.toBeNull();
    expect(await graph.getContentMeta('doc:1')).toMatchObject({
      mime: 'text/plain',
      size: 8,
    });

    const patch2 = await graph.createPatch();
    patch2.clearContent('doc:1');
    await patch2.commit();

    await graph.materialize();
    expect(await graph.getContent('doc:1')).toBeNull();
    expect(await graph.getContentHandle('doc:1')).toBeNull();
    expect(await graph.getContentMeta('doc:1')).toBeNull();
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
    expect(new TextDecoder().decode(content)).toBe('edge payload');

    const handle = await graph.getEdgeContentHandle('a', 'b', 'rel');
    expect(handle).toEqual(expect.any(String));
    expect(handle).not.toBe('');
  });

  it('persists and reads content metadata for edges', async () => {
    const graph = await repo.openGraph('test', 'alice');
    const binary = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);

    const patch = await graph.createPatch();
    patch.addNode('a').addNode('b').addEdge('a', 'b', 'rel');
    await patch.attachEdgeContent('a', 'b', 'rel', binary);
    await patch.commit();

    await graph.materialize();
    const meta = await graph.getEdgeContentMeta('a', 'b', 'rel');

    expect(meta).toEqual({
      handle: expect.any(String),
      mime: null,
      size: binary.byteLength,
    });
  });

  it('clearEdgeContent removes edge content and metadata through the public patch API', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const patch1 = await graph.createPatch();
    patch1.addNode('a').addNode('b').addEdge('a', 'b', 'rel');
    await patch1.attachEdgeContent('a', 'b', 'rel', 'clear edge', {
      mime: 'text/plain',
      size: 10,
    });
    await patch1.commit();

    await graph.materialize();
    expect(await graph.getEdgeContent('a', 'b', 'rel')).not.toBeNull();
    expect(await graph.getEdgeContentMeta('a', 'b', 'rel')).toMatchObject({
      mime: 'text/plain',
      size: 10,
    });

    const patch2 = await graph.createPatch();
    patch2.clearEdgeContent('a', 'b', 'rel');
    await patch2.commit();

    await graph.materialize();
    expect(await graph.getEdgeContent('a', 'b', 'rel')).toBeNull();
    expect(await graph.getEdgeContentHandle('a', 'b', 'rel')).toBeNull();
    expect(await graph.getEdgeContentMeta('a', 'b', 'rel')).toBeNull();
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
    expect(new TextDecoder().decode(content)).toBe('bob version');
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
    expect(new TextDecoder().decode(latest)).toBe('version 2');

    // Ceiling=1 should be v1
    await graph.materialize({ ceiling: 1 });
    const historical = await graph.getContent('doc:1');
    expect(new TextDecoder().decode(historical)).toBe('version 1');
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
    expect(new TextDecoder().decode(content)).toBe('via writer API');
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
    expect(new TextDecoder().decode(content)).toBe('must survive gc');
  });

  it('causal publication keeps every referenced asset out of immediate-prune output', async () => {
    const graph = await repo.openGraph('test', 'alice');
    const patch = await graph.createPatch();
    patch.addNode('doc:retained');
    await patch.attachContent('doc:retained', 'retained content');
    await patch.commit();
    await graph.materialize();

    const contentHandle = await graph.getContentHandle('doc:retained');
    const head = await repo.persistence.readRef('refs/warp/test/writers/alice');
    expect(contentHandle).not.toBeNull();
    expect(head).not.toBeNull();
    if (contentHandle === null || head === null) {
      throw new Error('Expected retained content and a causal publication head');
    }
    const message = DEFAULT_COMMIT_MESSAGE_CODEC.decodePatch(
      await repo.persistence.showNode(head),
    );
    const retainedOids = [
      GitCasAssetHandle.parse(contentHandle).oid,
      GitCasAssetHandle.parse(message.patchHandle.toString()).oid,
      await repo.persistence.getCommitTree(head),
    ];
    const prunable = execSync('git prune -n --expire=now', {
      cwd: repo.tempDir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    for (const oid of retainedOids) {
      expect(prunable).not.toContain(oid);
    }
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
    expect(new TextDecoder().decode(content)).toBe('checkpointed content');
  });

  it('binary content round-trips correctly', async () => {
    const graph = await repo.openGraph('test', 'alice');
    const binary = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);

    const patch = await graph.createPatch();
    patch.addNode('bin:1');
    await patch.attachContent('bin:1', binary);
    await patch.commit();

    await graph.materialize();
    const content = await graph.getContent('bin:1');
    expect(content).not.toBeNull();
    expect(content).toBeInstanceOf(Uint8Array);
    expect(content).toEqual(binary);
  });

  it('throws when _content points at a missing blob OID', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const patch = await graph.createPatch();
    patch.addNode('doc:1');
    await patch.attachContent('doc:1', 'hello');
    await patch.commit();

    await graph.materialize();

    const patch2 = await graph.createPatch();
    patch2.setProperty('doc:1', '_content', 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
    await patch2.commit();

    await graph.materialize();

    await expect(graph.getContentMeta('doc:1')).resolves.toEqual({
      handle: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      mime: null,
      size: null,
    });

    await expect(graph.getContent('doc:1'))
      .rejects.toMatchObject({ code: PersistenceError.E_MISSING_OBJECT });
  });

  it('throws when edge _content points at a missing blob OID', async () => {
    const graph = await repo.openGraph('test', 'alice');

    const patch = await graph.createPatch();
    patch.addNode('a').addNode('b').addEdge('a', 'b', 'rel');
    await patch.attachEdgeContent('a', 'b', 'rel', 'edge payload');
    await patch.commit();

    await graph.materialize();

    const patch2 = await graph.createPatch();
    patch2.setEdgeProperty('a', 'b', 'rel', '_content', 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
    await patch2.commit();

    await graph.materialize();

    await expect(graph.getEdgeContentMeta('a', 'b', 'rel')).resolves.toEqual({
      handle: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
      mime: null,
      size: null,
    });

    await expect(graph.getEdgeContent('a', 'b', 'rel'))
      .rejects.toMatchObject({ code: PersistenceError.E_MISSING_OBJECT });
  });
});
