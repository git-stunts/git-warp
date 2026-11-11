import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Runtime, type ContentAttachment } from '../../../index.ts';
import { intent, createNodeContentObserver, createEdgeContentObserver } from '../../../advanced.ts';
import { createTestRepo } from '../api/helpers/setup.ts';
import { writeStagedThroughWarp, writeThroughWarp } from '../../helpers/WarpSeed.ts';

const EDGE = Object.freeze({ from: 'document', to: 'related', label: 'links' });
const LANE = 'documents';

async function text(content: ContentAttachment | null): Promise<string> {
  expect(content).not.toBeNull();
  if (content === null) { throw new Error('Expected attachment'); }
  const decoder = new TextDecoder();
  let result = '';
  for await (const chunk of content.open()) { result += decoder.decode(chunk, { stream: true }); }
  return result + decoder.decode();
}

describe('Runtime public content observations of Warp writes', () => {
  let repository: Awaited<ReturnType<typeof createTestRepo>>;
  beforeEach(async () => { repository = await createTestRepo('content-read'); });
  afterEach(async () => { await repository.cleanup(); });

  it('captures node and edge metadata and keeps historical bytes after replacement and clearing', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'reader' });
    try {
      const lane = await runtime.lane(LANE);
      const node = createNodeContentObserver({ subject: 'document' });
      const edge = createEdgeContentObserver(EDGE);
      expect((await lane.observe(node).one()).value).toBeNull();
      let originalId = '';
      await writeStagedThroughWarp(repository.tempDir, LANE, 'writer-a', [{ content: 'original', metadata: { mime: 'text/plain' } }], ([content]) => {
        if (content === undefined) { throw new Error('Expected staged content'); }
        originalId = content.id;
        return [
          intent.node.add({ subject: 'document' }), intent.node.add({ subject: 'related' }),
          intent.edge.add(EDGE), intent.node.attachContent({ subject: 'document', content }),
          intent.edge.attachContent({ ...EDGE, content }),
        ];
      });
      const oldNode = await lane.observe(node).one();
      const oldEdge = await lane.observe(edge).one();
      expect(oldNode.value).toMatchObject({ id: originalId, size: 8, mime: 'text/plain', owner: { kind: 'node', subject: 'document' } });
      expect(oldEdge.value?.owner).toEqual({ kind: 'edge', ...EDGE });
      expect(oldNode.coordinate.basis.id).toBe(oldEdge.coordinate.basis.id);
      await writeStagedThroughWarp(repository.tempDir, LANE, 'writer-a', [{ content: 'new' }], ([replacement]) => {
        if (replacement === undefined) { throw new Error('Expected staged content'); }
        return intent.node.attachContent({ subject: 'document', content: replacement });
      });
      await writeThroughWarp(repository.tempDir, LANE, 'writer-a', intent.edge.clearContent(EDGE));
      expect(await text((await lane.observe(node).one()).value)).toBe('new');
      expect((await lane.observe(edge).one()).value).toBeNull();
      expect(await text(oldNode.value)).toBe('original');
      expect(await text(oldEdge.value)).toBe('original');
    } finally { await runtime.close(); }
  });

  it('does not hold Runtime open for unconsumed content and refuses consumption after close', async () => {
    await writeStagedThroughWarp(repository.tempDir, LANE, 'writer-a', [{ content: 'bytes' }], ([content]) => {
      if (content === undefined) { throw new Error('Expected staged content'); }
      return [intent.node.add({ subject: 'document' }), intent.node.attachContent({ subject: 'document', content })];
    });
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'reader' });
    const lane = await runtime.lane(LANE);
    const reading = await lane.observe(createNodeContentObserver({ subject: 'document' })).one();
    const unused = reading.value?.open();
    await runtime.close();
    if (unused === undefined) { throw new Error('Expected attachment stream'); }
    await expect(unused[Symbol.asyncIterator]().next()).rejects.toMatchObject({ code: 'E_RUNTIME_CLOSED' });
  });

  it('keeps winning metadata together across concurrent writers and clears removed owners', async () => {
    await writeThroughWarp(repository.tempDir, LANE, 'writer-a', intent.node.add({ subject: 'document' }));
    const staged: { id: string; mime: string | null; size: number; text: string }[] = [];
    const attach = (writer: string, content: string, mime: string) =>
      writeStagedThroughWarp(repository.tempDir, LANE, writer, [{ content, metadata: { mime } }], ([value]) => {
        if (value === undefined) { throw new Error('Expected staged content'); }
        staged.push({ id: value.id, mime: value.mime, size: value.size, text: content });
        return intent.node.attachContent({ subject: 'document', content: value });
      });
    await Promise.all([attach('writer-a', 'first', 'text/plain'), attach('writer-z', 'second writer', 'application/octet-stream')]);
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'reader' });
    const other = await Runtime.open({ at: repository.tempDir, writer: 'other-reader' });
    try {
      const lane = await runtime.lane(LANE);
      const peer = await other.lane(LANE);
      const observer = createNodeContentObserver({ subject: 'document' });
      const left = await lane.observe(observer).one();
      const right = await peer.observe(observer).one();
      expect(left.coordinate.basis.id).toBe(right.coordinate.basis.id);
      expect(left.value?.id).toBe(right.value?.id);
      const expected = staged.find(({ id }) => id === left.value?.id);
      if (expected === undefined) { throw new Error('Expected a staged winner'); }
      expect(left.value).toMatchObject({ id: expected.id, mime: expected.mime, size: expected.size });
      expect(await text(left.value)).toBe(expected.text);
      await writeThroughWarp(repository.tempDir, LANE, 'writer-a', intent.node.remove({ subject: 'document' }));
      await writeThroughWarp(repository.tempDir, LANE, 'writer-a', intent.node.add({ subject: 'document' }));
      expect((await lane.observe(observer).one()).value).toBeNull();
      expect(await text(left.value)).toBe(expected.text);
    } finally { await other.close(); await runtime.close(); }
  });
});
