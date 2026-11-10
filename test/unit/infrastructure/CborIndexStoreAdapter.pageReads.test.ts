import { describe, expect, it } from 'vitest';
import { PropertyShard } from '../../../src/domain/artifacts/PropertyShard.ts';
import { materializationPropertyShardKey }
  from '../../../src/domain/materialization/MaterializationPropertyProfile.ts';
import { MAX_BUFFERED_ARTIFACT_BYTES } from '../../../src/domain/storage/BufferedArtifactLimit.ts';
import WarpStream from '../../../src/domain/stream/WarpStream.ts';
import { collectAsyncIterable } from '../../../src/domain/utils/streamUtils.ts';
import { CborIndexStoreAdapter } from '../../../src/infrastructure/adapters/CborIndexStoreAdapter.ts';
import GitCasAssetStorageAdapter from '../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import defaultCodec from '../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryBlobStorageAdapter from '../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../helpers/InMemoryGraphAdapter.ts';

describe('CborIndexStoreAdapter page member reads', () => {
  it('opens and decodes a page-backed member without a caller byte limit', async () => {
    const cas = new InMemoryGitCasFacade({ history: new InMemoryGraphAdapter(), storage: new InMemoryBlobStorageAdapter() });
    const indexes = new CborIndexStoreAdapter({ codec: defaultCodec, assetStorage: new GitCasAssetStorageAdapter({ cas }), cas });
    const nodeId = 'node:page-unbounded-read';
    const shardKey = materializationPropertyShardKey(nodeId);
    const path = `props_${shardKey}.cbor`;
    const indexHandle = await indexes.writeShards(WarpStream.from([
      new PropertyShard({ shardKey, schemaVersion: 2, entries: [[nodeId, { status: 'ready' }]] }),
    ]), { expectedShardCount: 1, memberStorage: 'page', maxShardCount: 1, maxShardBytes: 1024 });
    const expected = { schemaVersion: 2, entries: [[nodeId, [['status', 'ready']]]] };

    const opened = await collectAsyncIterable(indexes.openShardAt(indexHandle, path), MAX_BUFFERED_ARTIFACT_BYTES);

    expect(defaultCodec.decode(opened)).toEqual(expected);
    await expect(indexes.decodeShardAt(indexHandle, path)).resolves.toEqual(expected);
  });
});
