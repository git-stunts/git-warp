import { describe, expect, it } from 'vitest';
import ContentAttachmentHandle from '../../../../src/domain/graph/ContentAttachmentHandle.ts';
import ContentAttachmentMime from '../../../../src/domain/graph/ContentAttachmentMime.ts';
import ContentAttachmentPayload from '../../../../src/domain/graph/ContentAttachmentPayload.ts';
import ContentAttachmentSize from '../../../../src/domain/graph/ContentAttachmentSize.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { encodeEdgeKey } from '../../../../src/domain/services/KeyCodec.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import {
  createPatchBuilder,
  createPatchBuilderMockPersistence,
  createPatchJournal,
} from './PatchBuilderTestHarness.ts';

const EDGE = Object.freeze({ from: 'doc:1', to: 'doc:2', label: 'links' });

function payload(): ContentAttachmentPayload {
  return new ContentAttachmentPayload({
    handle: new ContentAttachmentHandle('asset:staged'),
    mime: new ContentAttachmentMime('text/plain'),
    size: new ContentAttachmentSize(5),
  });
}

describe('pre-staged attachment publication', () => {
  it('publishes node metadata and its retention root together without staging again', async () => {
    const persistence = createPatchBuilderMockPersistence();
    const journal = createPatchJournal(persistence);
    const builder = createPatchBuilder({ persistence, patchJournal: journal });
    builder.addNode('doc:1');
    expect(builder.attachStagedContent('doc:1', payload())).toBe(builder);
    expect(builder.build().ops.slice(1)).toEqual([
      expect.objectContaining({ type: 'PropSet', node: 'doc:1', key: '_content', value: 'asset:staged' }),
      expect.objectContaining({ type: 'PropSet', node: 'doc:1', key: '_content.size', value: 5 }),
      expect.objectContaining({ type: 'PropSet', node: 'doc:1', key: '_content.mime', value: 'text/plain' }),
    ]);
    await builder.commit();
    expect(journal.requests).toHaveLength(1);
    expect(journal.requests[0]?.attachments.map(String)).toEqual(['asset:staged']);
    expect(journal.requests[0]?.patch.ops).toEqual(builder.build().ops);
    expect(() => builder.attachStagedContent('doc:1', payload())).toThrow(
      expect.objectContaining({ code: 'E_PATCH_ALREADY_COMMITTED' }),
    );
  });

  it('publishes edge metadata and its retention root in the same schema-3 patch', async () => {
    const persistence = createPatchBuilderMockPersistence();
    const journal = createPatchJournal(persistence);
    const builder = createPatchBuilder({ persistence, patchJournal: journal });
    builder.addNode(EDGE.from).addNode(EDGE.to).addEdge(EDGE.from, EDGE.to, EDGE.label);
    expect(builder.attachStagedEdgeContent(EDGE, payload())).toBe(builder);
    expect(builder.build().schema).toBe(3);
    expect(builder.ops.slice(3)).toEqual([
      expect.objectContaining({ type: 'EdgePropSet', ...EDGE, key: '_content', value: 'asset:staged' }),
      expect.objectContaining({ type: 'EdgePropSet', ...EDGE, key: '_content.size', value: 5 }),
      expect.objectContaining({ type: 'EdgePropSet', ...EDGE, key: '_content.mime', value: 'text/plain' }),
    ]);
    await builder.commit();
    expect(journal.requests).toHaveLength(1);
    expect(journal.requests[0]?.attachments.map(String)).toEqual(['asset:staged']);
    expect(journal.requests[0]?.patch.ops).toEqual(builder.build().ops);
    expect(() => builder.attachStagedEdgeContent(EDGE, payload())).toThrow(
      expect.objectContaining({ code: 'E_PATCH_ALREADY_COMMITTED' }),
    );
  });

  it('accepts live owners already in the captured state', () => {
    const state = WarpState.empty();
    state.nodeAlive.add('doc:1', Dot.create('earlier', 1));
    state.edgeAlive.add(encodeEdgeKey(EDGE.from, EDGE.to, EDGE.label), Dot.create('earlier', 2));
    const builder = createPatchBuilder({ getCurrentState: () => state });
    builder.attachStagedContent('doc:1', payload()).attachStagedEdgeContent(EDGE, payload());
    expect(builder.build().ops).toHaveLength(6);
    expect(builder.contentAssets.map(String)).toEqual(['asset:staged', 'asset:staged']);
  });

  it('refuses an absent node without emitting metadata or retention roots', () => {
    const builder = createPatchBuilder();
    expect(() => builder.attachStagedContent('absent', payload())).toThrow(
      expect.objectContaining({ code: 'E_PATCH_CONTENT_UNKNOWN_NODE' }),
    );
    expect(builder.build().ops).toEqual([]);
    expect(builder.contentAssets).toEqual([]);
  });

  it('refuses an absent edge without emitting metadata or retention roots', () => {
    const builder = createPatchBuilder();
    expect(() => builder.attachStagedEdgeContent(EDGE, payload())).toThrow(
      expect.objectContaining({ code: 'E_PATCH_EDGE_PROP_UNKNOWN_EDGE' }),
    );
    expect(builder.build().ops).toEqual([]);
    expect(builder.contentAssets).toEqual([]);
  });

  it('rejects fabricated payloads before appending the first metadata operation', () => {
    const builder = createPatchBuilder();
    builder.addNode('doc:1').addEdge(EDGE.from, EDGE.to, EDGE.label);
    const before = builder.build().ops;
    // @ts-expect-error Deliberately exercise the JavaScript runtime boundary.
    expect(() => builder.attachStagedContent('doc:1', {})).toThrow(
      expect.objectContaining({ code: 'E_VALIDATION' }),
    );
    // @ts-expect-error Deliberately exercise the JavaScript runtime boundary.
    expect(() => builder.attachStagedEdgeContent(EDGE, {})).toThrow(
      expect.objectContaining({ code: 'E_VALIDATION' }),
    );
    expect(builder.build().ops).toEqual(before);
    expect(builder.contentAssets).toEqual([]);
  });

  it('refuses an edge removed earlier in the same patch, but permits a fresh addition', () => {
    const state = WarpState.empty();
    state.edgeAlive.add(encodeEdgeKey(EDGE.from, EDGE.to, EDGE.label), Dot.create('earlier', 1));
    const builder = createPatchBuilder({ getCurrentState: () => state });
    builder.removeEdge(EDGE.from, EDGE.to, EDGE.label);
    const before = builder.build().ops;
    expect(() => builder.attachStagedEdgeContent(EDGE, payload())).toThrow(
      expect.objectContaining({ code: 'E_PATCH_EDGE_PROP_UNKNOWN_EDGE' }),
    );
    expect(builder.build().ops).toEqual(before);
    builder.addEdge(EDGE.from, EDGE.to, EDGE.label).attachStagedEdgeContent(EDGE, payload());
    expect(builder.contentAssets.map(String)).toEqual(['asset:staged']);
  });
});
