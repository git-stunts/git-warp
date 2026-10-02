import { expect, it, vi } from 'vitest';
import { CborIndexStoreAdapter } from '../../../src/infrastructure/adapters/CborIndexStoreAdapter.ts';
import GitCasAssetStorageAdapter from '../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import BundleHandle from '../../../src/domain/storage/BundleHandle.ts';
import codec from '../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryBlobStorageAdapter from '../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGraphAdapter from '../../helpers/InMemoryGraphAdapter.ts';
import InMemoryGitCasFacade from '../../helpers/InMemoryGitCasFacade.ts';

it('bounds asset-backed decodeShardAt when the caller omits a byte ceiling', async () => {
  const cas = new InMemoryGitCasFacade({ history: new InMemoryGraphAdapter(), storage: new InMemoryBlobStorageAdapter() });
  const assets = new GitCasAssetStorageAdapter({ cas });
  async function* original() { yield new Uint8Array([0xf6]); }
  const staged = await assets.stage(original(), { slug: 'index', filename: 'test' });
  const bundle = await cas.bundles.putOrdered({ members: [['payload.cbor', staged.handle.toString()]] });
  const handle = new BundleHandle(bundle.handle.toString());
  const indexes = new CborIndexStoreAdapter({ codec, assetStorage: assets, cas });
  await expect(indexes.decodeShardAt(handle, 'payload.cbor')).resolves.toBeNull();
  let finalized = false;
  const part = new Uint8Array(32 * 1024 * 1024 + 1);
  async function* oversized() { try { yield part; yield part; } finally { finalized = true; } }
  const open = vi.spyOn(assets, 'open').mockImplementation(oversized);
  try {
    await expect(indexes.decodeShardAt(handle, 'payload.cbor')).rejects.toMatchObject({ code: 'E_BYTE_COLLECTION_LIMIT' });
    expect(finalized).toBe(true);
  } finally { open.mockRestore(); }
});
