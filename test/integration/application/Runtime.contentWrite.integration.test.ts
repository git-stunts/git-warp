import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Runtime } from '../../../index.ts';
import { intent } from '../../../advanced.ts';
import { createTestRepo } from '../api/helpers/setup.ts';
import { collectNodeContent, collectEdgeContent } from '../../helpers/CollectAttachmentTestBytes.ts';

const EDGE = Object.freeze({ from: 'document', to: 'related', label: 'links' });
const WRITER_REF = 'refs/warp/documents/writers/writer-a';

describe('Runtime attachment writes', () => {
  let repository: Awaited<ReturnType<typeof createTestRepo>>;
  beforeEach(async () => { repository = await createTestRepo('content-write'); });
  afterEach(async () => { await repository.cleanup(); });

  it('attaches node and edge bytes with owner creation in one patch, then replaces and clears', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    try {
      const lane = await runtime.lane('documents');
      const content = await lane.stageContent('hello', { mime: 'text/plain' });
      const created = await lane.write([
        intent.node.add({ subject: 'document' }), intent.node.add({ subject: 'related' }),
        intent.edge.add(EDGE), intent.node.attachContent({ subject: 'document', content }),
        intent.edge.attachContent({ ...EDGE, content }),
      ]);
      expect(created.outcome.kind).toBe('derived');
      expect(await repository.persistence.countNodes(WRITER_REF)).toBe(1);
      const graph = await repository.openGraph('documents', 'verifier');
      await graph.materialize();
      expect(await graph.getContentMeta('document')).toMatchObject({ size: 5, mime: 'text/plain' });
      expect(await graph.getEdgeContentMeta(EDGE.from, EDGE.to, EDGE.label))
        .toMatchObject({ size: 5, mime: 'text/plain' });
      expect(await collectNodeContent(graph, 'document')).toEqual(new TextEncoder().encode('hello'));
      expect(await collectEdgeContent(graph, EDGE)).toEqual(new TextEncoder().encode('hello'));

      const replacement = await lane.stageContent('replacement');
      expect((await lane.write([
        intent.node.attachContent({ subject: 'document', content: replacement }),
        intent.edge.attachContent({ ...EDGE, content: replacement }),
      ])).outcome.kind).toBe('derived');
      await graph.materialize();
      expect(await graph.getContentMeta('document')).toMatchObject({ size: 11, mime: null });
      expect(await graph.getEdgeContentMeta(EDGE.from, EDGE.to, EDGE.label)).toMatchObject({ size: 11, mime: null });

      expect((await lane.write([
        intent.node.clearContent({ subject: 'document' }), intent.edge.clearContent(EDGE),
      ])).outcome.kind).toBe('derived');
      await graph.materialize();
      expect(await graph.getContentMeta('document')).toBeNull();
      expect(await graph.getEdgeContentMeta(EDGE.from, EDGE.to, EDGE.label)).toBeNull();
    } finally { await runtime.close(); }
  });

  it('refuses foreign staging even when both Runtimes share a repository', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    const foreign = await Runtime.open({ at: repository.tempDir, writer: 'writer-b' });
    try {
      const lane = await runtime.lane('documents');
      const other = await foreign.lane('documents');
      const content = await other.stageContent('foreign');
      await expect(lane.write([
        intent.node.add({ subject: 'document' }), intent.node.attachContent({ subject: 'document', content }),
      ])).rejects.toMatchObject({ code: 'E_CONTENT_FOREIGN' });
      expect(await repository.persistence.readRef(WRITER_REF)).toBeNull();
    } finally { await foreign.close(); await runtime.close(); }
  });

  it('does not publish a dangling attachment when unretained staged storage is pruned', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    try {
      const lane = await runtime.lane('documents');
      const content = await lane.stageContent('unretained staging');
      execFileSync('git', ['gc', '--prune=now'], { cwd: repository.tempDir, stdio: 'pipe' });
      await expect(lane.write([
        intent.node.add({ subject: 'document' }), intent.node.attachContent({ subject: 'document', content }),
      ])).rejects.toThrow();
      expect(await repository.persistence.readRef(WRITER_REF)).toBeNull();
    } finally { await runtime.close(); }
  });

  it('publishes none of an array when a later attachment has an absent owner', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    try {
      const lane = await runtime.lane('documents');
      const content = await lane.stageContent('bytes');
      const receipt = await lane.write([
        intent.node.add({ subject: 'document' }), intent.node.attachContent({ subject: 'document', content }),
        intent.edge.attachContent({ ...EDGE, content }),
      ]);
      expect(receipt.outcome.kind).toBe('obstruction');
      expect(await repository.persistence.readRef(WRITER_REF)).toBeNull();
    } finally { await runtime.close(); }
  });

  it('refuses attachment to an owner removed earlier in the same atomic write', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    try {
      const lane = await runtime.lane('documents');
      await lane.write(intent.node.add({ subject: 'document' }));
      const before = await repository.persistence.readRef(WRITER_REF);
      const content = await lane.stageContent('bytes');
      const receipt = await lane.write([
        intent.node.remove({ subject: 'document' }), intent.node.attachContent({ subject: 'document', content }),
      ]);
      expect(receipt.outcome.kind).toBe('obstruction');
      expect(await repository.persistence.readRef(WRITER_REF)).toBe(before);
    } finally { await runtime.close(); }
  });

  it('preserves attachment identity and retention through strand reopen and settlement', async () => {
    let runtime = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    try {
      const lane = await runtime.lane('documents');
      const strand = await runtime.fork(lane, { name: 'candidate' });
      const content = await strand.stageContent('retained', { mime: 'text/plain' });
      const receipt = await strand.write([
        intent.node.add({ subject: 'document' }), intent.node.add({ subject: 'related' }), intent.edge.add(EDGE),
        intent.node.attachContent({ subject: 'document', content }), intent.edge.attachContent({ ...EDGE, content }),
      ]);
      expect(receipt.outcome.kind).toBe('derived');
      await runtime.close();
      runtime = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
      const reopened = await runtime.lane('documents');
      const draft = await runtime.strand(reopened, { name: 'candidate' });
      const preview = await runtime.previewSettlement({ source: draft, target: reopened });
      expect((await runtime.settle(preview.plan)).outcome.kind).toBe('derived');
      execFileSync('git', ['gc', '--prune=now'], { cwd: repository.tempDir, stdio: 'pipe' });
      const graph = await repository.openGraph('documents', 'verifier');
      await graph.materialize();
      expect(await graph.getContentMeta('document')).toMatchObject({ size: 8, mime: 'text/plain' });
      expect(await graph.getEdgeContentMeta(EDGE.from, EDGE.to, EDGE.label))
        .toMatchObject({ size: 8, mime: 'text/plain' });
      expect(await collectNodeContent(graph, 'document')).toEqual(new TextEncoder().encode('retained'));
      expect(await collectEdgeContent(graph, EDGE)).toEqual(new TextEncoder().encode('retained'));
    } finally { await runtime.close(); }
  });

  it('attaches and clears on existing owners inherited from a strand fork', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    try {
      const parent = await runtime.lane('documents');
      await parent.write([
        intent.node.add({ subject: 'document' }), intent.node.add({ subject: 'related' }), intent.edge.add(EDGE),
      ]);
      const strand = await runtime.fork(parent, { name: 'existing-owners' });
      const content = await parent.stageContent('from the same Runtime');
      expect((await strand.write([
        intent.node.attachContent({ subject: 'document', content }), intent.edge.attachContent({ ...EDGE, content }),
      ])).outcome.kind).toBe('derived');
      const reopened = await runtime.strand(parent, { name: 'existing-owners' });
      expect((await reopened.write([
        intent.node.clearContent({ subject: 'document' }), intent.edge.clearContent(EDGE),
      ])).outcome.kind).toBe('derived');
      expect(await repository.persistence.countNodes(WRITER_REF)).toBe(1);
    } finally { await runtime.close(); }
  });
});
