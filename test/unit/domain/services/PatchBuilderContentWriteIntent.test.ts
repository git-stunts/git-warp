import { describe, expect, it } from 'vitest';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { encodeEdgeKey } from '../../../../src/domain/services/KeyCodec.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import {
  createPatchBuilder,
  RecordingAssetStorage,
} from './PatchBuilderTestHarness.ts';

describe('PatchBuilder content intent lowering', () => {
  it('stores a graph-neutral asset handle in node property atoms', async () => {
    const state = WarpState.empty();
    state.nodeAlive.add('doc:1', Dot.create('writer-a', 1));
    const storage = new RecordingAssetStorage(['git-cas:asset:document']);
    const builder = createPatchBuilder({
      getCurrentState: () => state,
      assetStorage: storage,
    });

    await builder.attachContent('doc:1', 'hello');

    expect(builder.build().ops).toContainEqual(expect.objectContaining({
      type: 'PropSet',
      node: 'doc:1',
      key: '_content',
      value: 'git-cas:asset:document',
    }));
  });

  it('validates streamed edge metadata before staging the asset', async () => {
    const state = WarpState.empty();
    state.edgeAlive.add(encodeEdgeKey('doc:1', 'doc:2', 'links'), Dot.create('writer-a', 1));
    const storage = new RecordingAssetStorage();
    const builder = createPatchBuilder({
      getCurrentState: () => state,
      assetStorage: storage,
    });

    await expect(
      builder.attachEdgeContent('doc:1', 'doc:2', 'links', chunks(), { mime: '' }),
    ).rejects.toThrow(/ContentAttachmentMime/u);
    expect(storage.calls).toEqual([]);
    expect(builder.build().ops).toEqual([]);
  });
});

async function* chunks(): AsyncIterable<Uint8Array> {
  yield new TextEncoder().encode('edge');
}
