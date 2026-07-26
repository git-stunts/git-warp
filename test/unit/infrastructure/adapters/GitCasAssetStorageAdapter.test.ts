import {
  AssetHandle as GitCasAssetHandle,
} from '@git-stunts/git-cas';
import { describe, expect, it, vi } from 'vitest';

import AssetHandle from '../../../../src/domain/storage/AssetHandle.ts';
import GitCasAssetStorageAdapter from '../../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

function createFixture() {
  const history = new InMemoryGraphAdapter();
  const backing = new InMemoryBlobStorageAdapter();
  const cas = new InMemoryGitCasFacade({ history, storage: backing });
  const put = vi.fn(cas.assets.put);
  const open = vi.fn(cas.assets.open);
  const facade = {
    assets: {
      put,
      adopt: cas.assets.adopt,
      open,
    },
  };
  const adapter = new GitCasAssetStorageAdapter({ cas: facade });
  return { adapter, backing, cas, history, open, put };
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

  it('rejects a staged asset whose byte count differs from the declared size', async () => {
    const { adapter } = createFixture();

    await expect(adapter.stage(chunks(), {
      slug: 'mismatched',
      expectedSize: 3,
    })).rejects.toMatchObject({
      code: 'E_ASSET_SIZE_MISMATCH',
      expectedSize: 3,
      actualSize: 4,
    });
  });

  it('rejects raw Git OIDs before invoking git-cas', async () => {
    const { adapter, open } = createFixture();

    await expect(collect(adapter.open(new AssetHandle('a'.repeat(40)))))
      .rejects.toThrow();
    expect(open).not.toHaveBeenCalled();
  });

  it('maps git-cas encryption failures at the streaming boundary', async () => {
    const upstream = Object.assign(new Error('legacy encryption scheme'), {
      code: 'LEGACY_SCHEME',
    });
    const assets = {
      put: vi.fn(),
      adopt: vi.fn(),
      open: vi.fn((): AsyncIterable<Uint8Array> => {
        throw upstream;
      }),
    };
    const adapter = new GitCasAssetStorageAdapter({
      cas: { assets },
    });

    await expect(collect(adapter.open(validHandle())))
      .rejects.toMatchObject({
        code: 'E_CAS_LEGACY_ENCRYPTION_SCHEME',
      });
  });
});
