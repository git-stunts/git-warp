import { describe, expect, it } from 'vitest';
import { PropertyShard } from '../../../src/domain/artifacts/PropertyShard.ts';
import { materializationPropertyShardKey }
  from '../../../src/domain/materialization/MaterializationPropertyProfile.ts';
import WarpStream from '../../../src/domain/stream/WarpStream.ts';
import { CborIndexStoreAdapter }
  from '../../../src/infrastructure/adapters/CborIndexStoreAdapter.ts';
import GitCasAssetStorageAdapter
  from '../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import GitCasMaterializationWorkspace
  from '../../../src/infrastructure/adapters/GitCasMaterializationWorkspace.ts';
import defaultCodec from '../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryBlobStorageAdapter from '../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../helpers/InMemoryGraphAdapter.ts';

describe('CborIndexStoreAdapter compound staging', () => {
  it('admits page shards and their dependent bundle in one generation', async () => {
    const cas = new InMemoryGitCasFacade({
      history: new InMemoryGraphAdapter(),
      storage: new InMemoryBlobStorageAdapter(),
    });
    const raw = await cas.workspaces.open({ namespace: 'index-compound-test' });
    const workspace = new GitCasMaterializationWorkspace({
      workspace: raw,
      promote: async () => {
        throw new Error('promotion is outside this staging test');
      },
    });
    const indexes = new CborIndexStoreAdapter({
      codec: defaultCodec,
      assetStorage: new GitCasAssetStorageAdapter({ cas }),
      cas,
    });
    const generationBefore = cas.readWorkspaceGenerationCount();
    const shardKey = materializationPropertyShardKey('node:compound');

    const root = await indexes.writeShards(WarpStream.from([
      new PropertyShard({
        shardKey,
        schemaVersion: 2,
        entries: [['node:compound', { status: 'ready' }]],
      }),
    ]), {
      expectedShardCount: 1,
      memberStorage: 'page',
      maxShardCount: 1,
      maxShardBytes: 1024,
      staging: workspace,
    });

    expect(cas.readWorkspaceGenerationCount() - generationBefore).toBe(1);
    expect(cas.readWorkspaceRoots()[0]).toEqual([root.toString()]);
    expect(cas.readBundleMembers(root.toString())).toEqual([
      [`props_${shardKey}.cbor`, expect.stringMatching(/^git-cas:1:page:/u)],
    ]);
    await workspace.release();
  });
});
