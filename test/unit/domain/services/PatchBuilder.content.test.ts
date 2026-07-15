import { describe, expect, it } from 'vitest';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import {
  encodeEdgeKey,
  encodeLegacyEdgePropNode,
} from '../../../../src/domain/services/KeyCodec.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import {
  createPatchBuilder,
  createPatchBuilderMockPersistence,
  createPatchJournal,
  RecordingAssetStorage,
} from './PatchBuilderTestHarness.ts';

describe('PatchBuilder content attachments', () => {
  it('stages node content and lowers its opaque handle and metadata', async () => {
    const state = stateWithNode('doc:1');
    const assets = new RecordingAssetStorage(['asset:document']);
    const builder = createPatchBuilder({
      graphName: 'events',
      getCurrentState: () => state,
      assetStorage: assets,
    });

    await builder.attachContent('doc:1', 'hello', { mime: 'text/plain' });

    expect(assets.calls).toHaveLength(1);
    expect(new TextDecoder().decode(assets.calls[0]?.bytes)).toBe('hello');
    expect(assets.calls[0]?.options).toEqual({
      slug: 'events/doc:1',
      filename: 'content',
      mime: 'text/plain',
      expectedSize: 5,
    });
    expect(builder.build().ops).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: 'PropSet',
        node: 'doc:1',
        key: '_content',
        value: 'asset:document',
      }),
      expect.objectContaining({
        type: 'PropSet',
        node: 'doc:1',
        key: '_content.size',
        value: 5,
      }),
      expect.objectContaining({
        type: 'PropSet',
        node: 'doc:1',
        key: '_content.mime',
        value: 'text/plain',
      }),
    ]));
  });

  it('streams content without buffering it at the public call boundary', async () => {
    const state = stateWithNode('doc:1');
    const assets = new RecordingAssetStorage(['asset:stream']);
    const builder = createPatchBuilder({
      getCurrentState: () => state,
      assetStorage: assets,
    });

    await builder.attachContent('doc:1', chunks('hello', ' world'), { size: 11 });

    expect(new TextDecoder().decode(assets.calls[0]?.bytes)).toBe('hello world');
    expect(assets.calls[0]?.options.expectedSize).toBe(11);
    expect(builder.build().ops).toContainEqual(expect.objectContaining({
      key: '_content.size',
      value: 11,
    }));
  });

  it('stages edge content and lowers edge properties', async () => {
    const state = WarpState.empty();
    state.edgeAlive.add(encodeEdgeKey('doc:1', 'doc:2', 'links'), Dot.create('writer-a', 1));
    const assets = new RecordingAssetStorage(['asset:edge']);
    const builder = createPatchBuilder({
      graphName: 'events',
      getCurrentState: () => state,
      assetStorage: assets,
    });

    await builder.attachEdgeContent('doc:1', 'doc:2', 'links', 'edge-data');

    expect(assets.calls[0]?.options.slug).toBe('events/doc:1/doc:2/links');
    expect(builder.build()).toMatchObject({ schema: 3 });
    expect(builder.build().ops).toContainEqual(expect.objectContaining({
      type: 'PropSet',
      node: encodeLegacyEdgePropNode('doc:1', 'doc:2', 'links'),
      scope: 2,
      key: '_content',
      value: 'asset:edge',
    }));
  });

  it('rejects missing asset storage before lowering attachment properties', async () => {
    const builder = createPatchBuilder({ getCurrentState: () => stateWithNode('doc:1') });

    await expect(builder.attachContent('doc:1', 'hello')).rejects.toMatchObject({
      code: 'NO_ASSET_STORAGE',
    });
    expect(builder.build().ops).toEqual([]);
  });

  it('rejects unknown graph targets without staging content', async () => {
    const assets = new RecordingAssetStorage();
    const builder = createPatchBuilder({
      getCurrentState: () => WarpState.empty(),
      assetStorage: assets,
    });

    await expect(builder.attachContent('missing', 'hello')).rejects.toMatchObject({
      code: 'E_PATCH_CONTENT_UNKNOWN_NODE',
    });
    await expect(
      builder.attachEdgeContent('a', 'b', 'links', 'hello'),
    ).rejects.toMatchObject({ code: 'E_PATCH_EDGE_PROP_UNKNOWN_EDGE' });
    expect(assets.calls).toEqual([]);
  });

  it('validates MIME and expected size before asking storage to stage bytes', async () => {
    const state = stateWithNode('doc:1');
    const assets = new RecordingAssetStorage();
    const builder = createPatchBuilder({
      getCurrentState: () => state,
      assetStorage: assets,
    });

    await expect(builder.attachContent('doc:1', 'hello', { mime: '' }))
      .rejects.toThrow(/mime must be a non-empty string/u);
    await expect(builder.attachContent('doc:1', 'hello', { size: 4 }))
      .rejects.toThrow(/does not match actual byte size/u);
    expect(assets.calls).toEqual([]);
    expect(builder.build().ops).toEqual([]);
  });

  it('does not lower properties when storage fails', async () => {
    const assets = new RecordingAssetStorage();
    const failure = new Error('asset storage unavailable');
    assets.failure = failure;
    const builder = createPatchBuilder({
      getCurrentState: () => stateWithNode('doc:1'),
      assetStorage: assets,
    });

    await expect(builder.attachContent('doc:1', 'hello')).rejects.toBe(failure);
    expect(builder.build().ops).toEqual([]);
  });

  it('forwards staged attachment handles to the patch publication bundle', async () => {
    const persistence = createPatchBuilderMockPersistence();
    const journal = createPatchJournal(persistence);
    const assets = new RecordingAssetStorage(['asset:first', 'asset:second']);
    const builder = createPatchBuilder({
      persistence,
      patchJournal: journal,
      assetStorage: assets,
    });
    builder.addNode('doc:1').addNode('doc:2');
    await builder.attachContent('doc:1', 'first');
    await builder.attachContent('doc:2', 'second');

    await builder.commit();

    expect(journal.requests[0]?.attachments.map(String)).toEqual([
      'asset:first',
      'asset:second',
    ]);
  });

  it('clears node and edge content with null property intents and no storage write', () => {
    const state = stateWithNode('doc:1');
    state.edgeAlive.add(encodeEdgeKey('doc:1', 'doc:2', 'links'), Dot.create('writer-a', 2));
    const assets = new RecordingAssetStorage();
    const builder = createPatchBuilder({
      getCurrentState: () => state,
      assetStorage: assets,
    });

    builder.clearContent('doc:1');
    builder.clearEdgeContent('doc:1', 'doc:2', 'links');

    expect(assets.calls).toEqual([]);
    expect(builder.build().ops.filter((op) => 'value' in op && op.value === null)).toHaveLength(6);
  });
});

function stateWithNode(nodeId: string): WarpState {
  const state = WarpState.empty();
  state.nodeAlive.add(nodeId, Dot.create('writer-a', 1));
  return state;
}

async function* chunks(...values: string[]): AsyncIterable<Uint8Array> {
  for (const value of values) {
    yield new TextEncoder().encode(value);
  }
}
