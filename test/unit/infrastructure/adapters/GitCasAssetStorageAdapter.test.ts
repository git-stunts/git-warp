import {
  AssetHandle as GitCasAssetHandle,
  type AssetCapability,
} from '@git-stunts/git-cas';
import { describe, expect, it, vi } from 'vitest';

import PersistenceError from '../../../../src/domain/errors/PersistenceError.ts';
import AssetHandle from '../../../../src/domain/storage/AssetHandle.ts';
import GitCasAssetStorageAdapter from '../../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import {
  V17_SUBSTRATE_MIGRATION_COMPATIBILITY_POLICY,
} from '../../../../scripts/migrations/v17.0.0/SubstrateMigrationCompatibilityPolicy.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

const LEGACY_OID = 'a'.repeat(40);

function createFixture() {
  const history = new InMemoryGraphAdapter();
  const backing = new InMemoryBlobStorageAdapter();
  const cas = new InMemoryGitCasFacade({ history, storage: backing });
  const put = vi.fn(cas.assets.put);
  const facade = {
    assets: {
      put,
      adopt: cas.assets.adopt,
      open: cas.assets.open,
    },
  };
  const legacyReader = { readBlob: vi.fn(async () => null) };
  const adapter = new GitCasAssetStorageAdapter({ cas: facade, legacyReader });
  return { adapter, backing, cas, history, legacyReader, put };
}

function validHandle(oid = 'b'.repeat(64)): AssetHandle {
  return new AssetHandle(new GitCasAssetHandle({
    codec: 'raw',
    hashAlgorithm: 'sha256',
    oid,
  }).toString());
}

async function collect(source: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of source) {
    chunks.push(chunk);
  }
  return Uint8Array.from(chunks.flatMap((chunk) => [...chunk]));
}

async function* chunks(): AsyncGenerator<Uint8Array> {
  yield new Uint8Array([1, 2]);
  yield new Uint8Array([3, 4]);
}

describe('GitCasAssetStorageAdapter', () => {
  it('hands the original stream to git-cas and round-trips through an opaque handle', async () => {
    const { adapter, put } = createFixture();
    const source = chunks();

    const staged = await adapter.stage(source, { slug: 'streamed' });

    expect(put).toHaveBeenCalledWith(expect.objectContaining({
      source,
      slug: 'streamed',
      filename: 'content',
    }));
    expect(staged.retention).toEqual({
      reachability: 'unanchored',
      protection: 'not-established',
    });
    await expect(collect(adapter.open(staged.handle)))
      .resolves.toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('adopts legacy asset-tree OIDs before opening them', async () => {
    const { backing, cas, history } = createFixture();
    const stored = await backing.store('legacy tree');
    const oid = GitCasAssetHandle.parse(stored.toString()).oid;
    vi.spyOn(history, 'readObjectType').mockResolvedValue('tree');
    const adopt = vi.fn(cas.assets.adopt);
    const adapter = new GitCasAssetStorageAdapter({
      cas: { assets: { ...cas.assets, adopt } },
      legacyReader: { readBlob: vi.fn(async () => null) },
    });

    await expect(collect(adapter.open(new AssetHandle(oid))))
      .resolves.toEqual(new TextEncoder().encode('legacy tree'));
    expect(adopt).toHaveBeenCalledWith({ treeOid: oid });
  });

  it('requires explicit compatibility before returning a legacy raw blob', async () => {
    const bytes = new Uint8Array([7, 8, 9]);
    const assets = legacyFallbackAssets();
    const legacyReader = { readBlob: vi.fn(async () => bytes) };
    const current = new GitCasAssetStorageAdapter({
      cas: { assets },
      legacyReader,
    });
    const compatible = new GitCasAssetStorageAdapter({
      cas: { assets },
      legacyReader,
      compatibilityPolicy: V17_SUBSTRATE_MIGRATION_COMPATIBILITY_POLICY,
    });

    await expect(collect(current.open(new AssetHandle(LEGACY_OID))))
      .rejects.toMatchObject({ code: 'E_LEGACY_SUBSTRATE_DISABLED' });
    await expect(collect(compatible.open(new AssetHandle(LEGACY_OID))))
      .resolves.toEqual(bytes);
  });

  it('preserves current asset adoption failures without probing legacy blobs', async () => {
    const corruption = Object.assign(new Error('manifest integrity failure'), {
      code: 'MANIFEST_INTEGRITY_ERROR',
    });
    const legacyReader = { readBlob: vi.fn(async () => new Uint8Array([1])) };
    const assets = {
      ...legacyFallbackAssets(),
      adopt: vi.fn(async () => Promise.reject(corruption)),
    };
    const adapter = new GitCasAssetStorageAdapter({
      cas: { assets },
      legacyReader,
      compatibilityPolicy: V17_SUBSTRATE_MIGRATION_COMPATIBILITY_POLICY,
    });

    await expect(collect(adapter.open(new AssetHandle(LEGACY_OID))))
      .rejects.toBe(corruption);
    expect(legacyReader.readBlob).not.toHaveBeenCalled();
  });

  it('preserves unexpected legacy read errors and reports missing objects with cause', async () => {
    const assets = legacyFallbackAssets();
    const unexpected = new Error('disk unavailable');
    const failed = new GitCasAssetStorageAdapter({
      cas: { assets },
      legacyReader: { readBlob: vi.fn(async () => Promise.reject(unexpected)) },
      compatibilityPolicy: V17_SUBSTRATE_MIGRATION_COMPATIBILITY_POLICY,
    });
    const missingCause = new PersistenceError(
      'missing legacy blob',
      PersistenceError.E_MISSING_OBJECT,
    );
    const missing = new GitCasAssetStorageAdapter({
      cas: { assets },
      legacyReader: { readBlob: vi.fn(async () => Promise.reject(missingCause)) },
      compatibilityPolicy: V17_SUBSTRATE_MIGRATION_COMPATIBILITY_POLICY,
    });

    await expect(collect(failed.open(new AssetHandle(LEGACY_OID)))).rejects.toBe(unexpected);
    await expect(collect(missing.open(new AssetHandle(LEGACY_OID))))
      .rejects.toMatchObject({
        code: PersistenceError.E_MISSING_OBJECT,
        cause: expect.any(Error),
      });
  });

  it('maps git-cas encryption failures at the streaming boundary', async () => {
    const upstream = Object.assign(new Error('legacy encryption scheme'), {
      code: 'LEGACY_SCHEME',
    });
    const assets = {
      ...legacyFallbackAssets(),
      open: vi.fn((): AsyncIterable<Uint8Array> => {
        throw upstream;
      }),
    };
    const adapter = new GitCasAssetStorageAdapter({
      cas: { assets },
      legacyReader: { readBlob: vi.fn(async () => null) },
    });

    await expect(collect(adapter.open(validHandle())))
      .rejects.toMatchObject({
        code: 'E_CAS_LEGACY_ENCRYPTION_SCHEME',
      });
  });
});

function legacyFallbackAssets(): Pick<AssetCapability, 'put' | 'adopt' | 'open'> {
  return {
    put: vi.fn(),
    adopt: vi.fn(async () => Promise.reject(
      Object.assign(new Error('not an asset tree'), { code: 'GIT_ERROR' }),
    )),
    open: vi.fn(() => chunks()),
  };
}
