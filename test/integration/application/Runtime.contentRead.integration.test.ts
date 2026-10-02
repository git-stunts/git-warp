import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Runtime, type ContentAttachment } from '../../../index.ts';
import { intent, createNodeContentObserver, createEdgeContentObserver } from '../../../advanced.ts';
import { createTestRepo } from '../api/helpers/setup.ts';

const EDGE = Object.freeze({ from: 'document', to: 'related', label: 'links' });

async function text(content: ContentAttachment | null): Promise<string> {
  expect(content).not.toBeNull();
  if (content === null) { throw new Error('Expected attachment'); }
  const decoder = new TextDecoder();
  let result = '';
  for await (const chunk of content.open()) { result += decoder.decode(chunk, { stream: true }); }
  return result + decoder.decode();
}

describe('Runtime public content observations', () => {
  let repository: Awaited<ReturnType<typeof createTestRepo>>;
  beforeEach(async () => { repository = await createTestRepo('content-read'); });
  afterEach(async () => { await repository.cleanup(); });

  it('captures node and edge metadata and keeps historical bytes after replacement and clearing', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    try {
      const lane = await runtime.lane('documents');
      const node = createNodeContentObserver({ subject: 'document' });
      const edge = createEdgeContentObserver(EDGE);
      expect((await lane.observe(node).one()).value).toBeNull();
      const content = await lane.stageContent('original', { mime: 'text/plain' });
      await lane.write([
        intent.node.add({ subject: 'document' }), intent.node.add({ subject: 'related' }),
        intent.edge.add(EDGE), intent.node.attachContent({ subject: 'document', content }),
        intent.edge.attachContent({ ...EDGE, content }),
      ]);
      const oldNode = await lane.observe(node).one();
      const oldEdge = await lane.observe(edge).one();
      expect(oldNode.value).toMatchObject({ id: content.id, size: 8, mime: 'text/plain', owner: { kind: 'node', subject: 'document' } });
      expect(oldEdge.value?.owner).toEqual({ kind: 'edge', ...EDGE });
      expect(oldNode.coordinate.basis.id).toBe(oldEdge.coordinate.basis.id);
      const replacement = await lane.stageContent('new');
      await lane.write(intent.node.attachContent({ subject: 'document', content: replacement }));
      await lane.write(intent.edge.clearContent(EDGE));
      expect(await text((await lane.observe(node).one()).value)).toBe('new');
      expect((await lane.observe(edge).one()).value).toBeNull();
      expect(await text(oldNode.value)).toBe('original');
      expect(await text(oldEdge.value)).toBe('original');
    } finally { await runtime.close(); }
  });

  it('does not hold Runtime open for unconsumed content and refuses consumption after close', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    const lane = await runtime.lane('documents');
    const content = await lane.stageContent('bytes');
    await lane.write([intent.node.add({ subject: 'document' }), intent.node.attachContent({ subject: 'document', content })]);
    const reading = await lane.observe(createNodeContentObserver({ subject: 'document' })).one();
    const unused = reading.value?.open();
    await runtime.close();
    if (unused === undefined) { throw new Error('Expected attachment stream'); }
    await expect(unused[Symbol.asyncIterator]().next()).rejects.toMatchObject({ code: 'E_RUNTIME_CLOSED' });
  });
  it('reads strand content at its pinned parent coordinate, then reopens after checkpoint and pruning', async () => {
    let runtime = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    try {
      const parent = await runtime.lane('documents');
      const content = await parent.stageContent('parent');
      await parent.write([
        intent.node.add({ subject: 'document' }), intent.node.add({ subject: 'related' }), intent.edge.add(EDGE),
        intent.node.attachContent({ subject: 'document', content }), intent.edge.attachContent({ ...EDGE, content }),
      ]);
      const strand = await runtime.fork(parent, { name: 'draft' });
      await parent.write(intent.node.clearContent({ subject: 'document' }));
      const node = createNodeContentObserver({ subject: 'document' });
      expect(await text((await strand.observe(node).one()).value)).toBe('parent');
      const next = await strand.stageContent('strand');
      await strand.write(intent.edge.attachContent({ ...EDGE, content: next }));
      expect(await text((await strand.observe(createEdgeContentObserver(EDGE)).one()).value)).toBe('strand');
      await runtime.close();
      execFileSync('git', ['gc', '--prune=now'], { cwd: repository.tempDir, stdio: 'pipe' });
      runtime = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
      const reopened = await runtime.strand(await runtime.lane('documents'), { name: 'draft' });
      expect(await text((await reopened.observe(node).one()).value)).toBe('parent');
      expect(await text((await reopened.observe(createEdgeContentObserver(EDGE)).one()).value)).toBe('strand');
    } finally { await runtime.close(); }
  });

  it('keeps winning metadata together across concurrent writers and clears removed owners', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    const other = await Runtime.open({ at: repository.tempDir, writer: 'writer-z' });
    try {
      const lane = await runtime.lane('documents');
      const peer = await other.lane('documents');
      const observer = createNodeContentObserver({ subject: 'document' });
      await lane.write(intent.node.add({ subject: 'document' }));
      const first = await lane.stageContent('first', { mime: 'text/plain' });
      const second = await peer.stageContent('second writer', { mime: 'application/octet-stream' });
      await Promise.all([
        lane.write(intent.node.attachContent({ subject: 'document', content: first })),
        peer.write(intent.node.attachContent({ subject: 'document', content: second })),
      ]);
      const left = await lane.observe(observer).one();
      const right = await peer.observe(observer).one();
      expect(left.coordinate.basis.id).toBe(right.coordinate.basis.id);
      expect(left.value?.id).toBe(right.value?.id);
      const expected = left.value?.id === first.id ? first : second;
      expect(left.value).toMatchObject({ id: expected.id, mime: expected.mime, size: expected.size });
      expect(await text(left.value)).toBe(expected === first ? 'first' : 'second writer');
      await lane.write(intent.node.remove({ subject: 'document' }));
      await lane.write(intent.node.add({ subject: 'document' }));
      expect((await lane.observe(observer).one()).value).toBeNull();
      expect(await text(left.value)).toBe(expected === first ? 'first' : 'second writer');
    } finally { await other.close(); await runtime.close(); }
  });

});
