import { describe, expect, it, vi } from 'vitest';

import { TrustRecord } from '../../../../src/domain/trust/TrustRecord.ts';
import GitCasRepositoryAdapter from '../../../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import GitCasMaterializationCacheDiagnosticsAdapter
  from '../../../../src/infrastructure/adapters/GitCasMaterializationCacheDiagnosticsAdapter.ts';
import GitCasMaterializationStoreAdapter from '../../../../src/infrastructure/adapters/GitCasMaterializationStoreAdapter.ts';
import GitCasTrieStoreAdapter from '../../../../src/infrastructure/adapters/GitCasTrieStoreAdapter.ts';
import GitTimelineHistoryAdapter from '../../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import CryptoPort from '../../../../src/ports/CryptoPort.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';

const EMPTY_TREE = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

class TestCrypto extends CryptoPort {
  hash(_algorithm: string, _data: string | Uint8Array): Promise<string> {
    return Promise.resolve('record-hash');
  }

  hmac(
    _algorithm: string,
    _key: string | Uint8Array,
    _data: string | Uint8Array,
  ): Promise<Uint8Array> {
    return Promise.resolve(new Uint8Array());
  }

  timingSafeEqual(left: Uint8Array, right: Uint8Array): boolean {
    return left.length === right.length;
  }
}

function createPlumbing() {
  const stream = {
    async *[Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
      // The composition test replaces every history operation before use.
    },
    collect(): Promise<string> {
      return Promise.resolve('');
    },
  };
  return {
    emptyTree: EMPTY_TREE,
    execute: vi.fn(async () => ''),
    executeStream: vi.fn(async () => stream),
  };
}

describe('GitCasRepositoryAdapter', () => {
  it('shares one git-cas facade across semantic repository services', async () => {
    const plumbing = createPlumbing();
    const history = new GitTimelineHistoryAdapter({ plumbing });
    vi.spyOn(history, 'readRef').mockResolvedValue(null);
    vi.spyOn(history, 'writeBlob').mockResolvedValue('a'.repeat(40));
    vi.spyOn(history, 'updateRef').mockResolvedValue(undefined);
    vi.spyOn(history, 'compareAndSwapRef').mockResolvedValue(undefined);
    vi.spyOn(history, 'nodeExists').mockResolvedValue(true);
    vi.spyOn(history, 'readObjectType').mockResolvedValue('tree');

    const assetStorage = new InMemoryBlobStorageAdapter();
    const highLevelCas = new InMemoryGitCasFacade({ history, storage: assetStorage });
    const putAsset = vi.fn(highLevelCas.assets.put);
    const store = vi.fn().mockResolvedValue({ slug: 'manifest', chunks: [] });
    const closeCas = vi.fn().mockResolvedValue(undefined);
    const createTree = vi.fn()
      .mockResolvedValueOnce('1'.repeat(40))
      .mockResolvedValueOnce('2'.repeat(40))
      .mockResolvedValueOnce('3'.repeat(40))
      .mockResolvedValueOnce('4'.repeat(40));
    const cas = {
      assets: {
        put: putAsset,
        adopt: highLevelCas.assets.adopt,
        open: highLevelCas.assets.open,
      },
      bundles: highLevelCas.bundles,
      caches: highLevelCas.caches,
      pages: highLevelCas.pages,
      workspaces: highLevelCas.workspaces,
      expiringSets: {
        open: vi.fn(async () => ({} as any)),
      },
      publications: highLevelCas.publications,
      readManifest: vi.fn(),
      restore: vi.fn(),
      restoreStream: vi.fn(),
      store,
      createTree,
      close: closeCas,
    };
    const repository = new GitCasRepositoryAdapter({ plumbing, history, cas });
    const services = await repository.createRuntimeStorageServices({
      timelineName: 'events',
      codec: defaultCodec,
      crypto: new TestCrypto(),
      commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
    });

    await services.content.stage(singleChunk('content'), { slug: 'content' });
    expect(services.materializations).toBeInstanceOf(GitCasMaterializationStoreAdapter);
    expect(services.materializationCacheDiagnostics)
      .toBeInstanceOf(GitCasMaterializationCacheDiagnosticsAdapter);
    expect(await services.materializationCacheDiagnostics?.inspectCache())
      .toMatchObject({ healthy: true, entries: [] });
    expect(services.stateSnapshots).toBeUndefined();
    expect(services.trie).toBeInstanceOf(GitCasTrieStoreAdapter);
    expect(services.syncReplayProtection).toBeDefined();
    const seekCursors = await repository.createSeekCursorStore('events');
    expect(await repository.createSeekCursorStore('events')).toBe(seekCursors);

    plumbing.execute
      .mockResolvedValueOnce('f'.repeat(40))
      .mockResolvedValueOnce('');
    await repository.createTrustChain(new TestCrypto()).persistRecord(
      'events',
      TrustRecord.fromDecoded({
        schemaVersion: 1,
        recordType: 'KEY_ADD',
        recordId: 'record-hash',
        issuerKeyId: 'issuer',
        issuedAt: '2026-07-13T00:00:00.000Z',
        prev: null,
        subject: { keyId: 'subject', publicKey: 'public-key' },
        meta: {},
        signature: { alg: 'ed25519', sig: 'signature' },
        signaturePayload: new Uint8Array([1]),
      }),
      null,
    );

    expect(putAsset).toHaveBeenCalledTimes(2);
    expect(putAsset).toHaveBeenCalledWith(expect.objectContaining({ slug: 'content' }));
    expect(putAsset).toHaveBeenCalledWith(expect.objectContaining({ slug: 'trust-record-hash' }));
    expect(store).not.toHaveBeenCalled();

    const activeServices = await repository.createRuntimeStorageServices({
      timelineName: 'active-at-close',
      codec: defaultCodec,
      crypto: new TestCrypto(),
      commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
    });
    const closeMaterializations = vi.spyOn(services.materializations, 'close');
    const closeActiveMaterializations = vi.spyOn(activeServices.materializations, 'close');
    await services.materializations.close();
    await repository[Symbol.asyncDispose]();
    await repository.close();

    expect(closeMaterializations).toHaveBeenCalledTimes(1);
    expect(closeActiveMaterializations).toHaveBeenCalledTimes(1);
    expect(closeCas).not.toHaveBeenCalled();
    await expect(repository.createRuntimeStorageServices({
      timelineName: 'closed',
      codec: defaultCodec,
      crypto: new TestCrypto(),
      commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
    })).rejects.toThrow('Git CAS repository storage is closed');
    expect(() => repository.createTrustChain(new TestCrypto()))
      .toThrow('Git CAS repository storage is closed');
  });
});

async function* singleChunk(value: string): AsyncGenerator<Uint8Array> {
  yield new TextEncoder().encode(value);
}
