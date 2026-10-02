import { expect, it } from 'vitest';
import { AssetHandle, StagedAsset } from '@git-stunts/git-cas';
import GitCasAssetStorageAdapter from '../../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import CasContentEncryptionPolicy from '../../../../src/infrastructure/adapters/CasContentEncryptionPolicy.ts';

const handle = new AssetHandle({ codec: 'raw', hashAlgorithm: 'sha256', oid: 'b'.repeat(64) });
function receipt(size) {
  return new StagedAsset({ handle, slug: 'fixture', filename: 'bytes', size, observedAt: '2026-10-02T00:00:00.000Z' });
}
async function* source() { yield new Uint8Array([1, 2, 3]); }

it.each([3, undefined])('reports consumed plaintext for an encrypted receipt (declared %s)', async (expectedSize) => {
  const adapter = new GitCasAssetStorageAdapter({
    contentEncryption: CasContentEncryptionPolicy.fromInternalResolvedKey({
      encryptionKey: new Uint8Array(32).fill(7), scheme: 'framed', frameBytes: 65536,
    }),
    cas: { assets: {
      async put(options) {
        let plaintext = 0;
        for await (const chunk of options.source) plaintext += chunk.byteLength;
        return receipt(plaintext + 16);
      },
      open: source,
    } },
  });
  await expect(adapter.stage(source(), { slug: 'fixture', expectedSize })).resolves.toMatchObject({ size: 3 });
});

it('refuses a success receipt when storage did not finish consuming the input', async () => {
  const adapter = new GitCasAssetStorageAdapter({ cas: { assets: { put: async () => receipt(3), open: source } } });
  await expect(adapter.stage(source(), { slug: 'fixture', expectedSize: 3 }))
    .rejects.toMatchObject({ code: 'E_ASSET_INPUT_INCOMPLETE' });
});

it('still rejects an incorrect unencrypted receipt', async () => {
  const adapter = new GitCasAssetStorageAdapter({ cas: { assets: {
    async put(options) { for await (const chunk of options.source) { expect(chunk.byteLength).toBe(3); } return receipt(4); },
    open: source,
  } } });
  await expect(adapter.stage(source(), { slug: 'fixture' }))
    .rejects.toMatchObject({ code: 'E_ASSET_SIZE_MISMATCH', expectedSize: 3, actualSize: 4 });
});
