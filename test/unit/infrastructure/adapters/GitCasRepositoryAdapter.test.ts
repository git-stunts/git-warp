import {
  type RootSetEntry,
  type RootSetMutationResult,
  type RootSetState,
} from '@git-stunts/git-cas';
import { describe, expect, it, vi } from 'vitest';

import { TrustRecord } from '../../../../src/domain/trust/TrustRecord.ts';
import WarpState from '../../../../src/domain/services/state/WarpState.ts';
import GitCasRepositoryAdapter from '../../../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import GitCasMaterializationStoreAdapter from '../../../../src/infrastructure/adapters/GitCasMaterializationStoreAdapter.ts';
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

function createRootSet() {
  let entries: RootSetEntry[] = [];
  const state = (): RootSetState => ({
    ref: 'refs/cas/rootsets/git-warp/events/state-cache',
    headOid: entries.length === 0 ? null : 'd'.repeat(40),
    treeOid: entries.length === 0 ? null : 'e'.repeat(40),
    entries: [...entries],
  });
  const mutation = (): RootSetMutationResult => ({
    changed: true,
    commitOid: 'd'.repeat(40),
    treeOid: 'e'.repeat(40),
    entries: [...entries],
  });
  return {
    read: vi.fn(async () => state()),
    mutate: vi.fn(async (
      mutator: (
        current: ReadonlyArray<Readonly<RootSetEntry>>,
      ) => Iterable<RootSetEntry> | Promise<Iterable<RootSetEntry>>,
    ) => {
      entries = [...await mutator(entries)];
      return mutation();
    }),
    replace: vi.fn(async (options: {
      entries: Iterable<RootSetEntry>;
      expectedHeadOid?: string | null;
    }) => {
      entries = [...options.entries];
      return mutation();
    }),
    doctor: vi.fn(async () => ({
      healthy: true as const,
      ...state(),
    })),
    repair: vi.fn(async (options: { entries: Iterable<RootSetEntry> }) => {
      entries = [...options.entries];
      return {
        repaired: true as const,
        commitOid: 'd'.repeat(40),
        treeOid: 'e'.repeat(40),
        entries: [...entries],
      };
    }),
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
    const rootSet = createRootSet();
    const store = vi.fn().mockResolvedValue({ slug: 'manifest', chunks: [] });
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
      publications: highLevelCas.publications,
      rootSets: { open: vi.fn(async () => rootSet) },
      readManifest: vi.fn(),
      restore: vi.fn(),
      restoreStream: vi.fn(),
      store,
      createTree,
    };
    const repository = new GitCasRepositoryAdapter({ plumbing, history, cas });
    const services = await repository.createRuntimeStorageServices({
      timelineName: 'events',
      codec: defaultCodec,
      crypto: new TestCrypto(),
      commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
    });

    await services.content.stage(singleChunk('content'), { slug: 'content' });
    const stateSnapshots = services.stateSnapshots;
    if (stateSnapshots === undefined) {
      throw new Error('Git repository storage must provide state snapshots');
    }
    await stateSnapshots.put({
      snapshotId: 'snapshot-1',
      coordinate: { frontier: new Map(), ceiling: 1 },
      retention: 'evictable',
      provenancePosture: 'full',
      stateHash: 'state-hash',
      payloadRef: '',
      createdAt: '2026-07-13T00:00:00.000Z',
      state: WarpState.empty(),
    });
    expect(services.materializations).toBeInstanceOf(GitCasMaterializationStoreAdapter);

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
    expect(store).toHaveBeenCalledTimes(1);
    expect(store).toHaveBeenCalledWith(expect.objectContaining({ slug: 'snapshot-1' }));
  });
});

async function* singleChunk(value: string): AsyncGenerator<Uint8Array> {
  yield new TextEncoder().encode(value);
}
