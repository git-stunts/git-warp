import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import CommitMessageCodecPort, {
  createGitCasPatchStorage,
  type AnchorCommitMessage,
  type CheckpointCommitMessage,
  type CommitMessageKind,
  type PatchCommitMessage,
} from '../../../../src/ports/CommitMessageCodecPort.ts';
import TrustCryptoPort, { type TrustSignatureVerification } from '../../../../src/ports/TrustCryptoPort.ts';
import InMemoryGraphAdapter from '../../../../test/helpers/InMemoryGraphAdapter.ts';
import MemoryRuntimeStorageAdapter from '../../../../test/helpers/MemoryRuntimeStorageAdapter.ts';
import { createFakeCodecPort, createMockCrypto } from '../../../helpers/mockPorts.ts';
import AssetHandle from '../../../../src/domain/storage/AssetHandle.ts';
import BundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import HostRandomAdapter from '../../../../src/infrastructure/adapters/HostRandomAdapter.ts';
import SequenceRandomPort from '../../../helpers/SequenceRandomPort.ts';

import type { NormalizedTrustConfig } from '../../../../src/domain/runtimeHelpers.ts';

const TRUST_OFF: NormalizedTrustConfig = { mode: 'off', pin: null };
const TRUST_ENFORCE: NormalizedTrustConfig = { mode: 'enforce', pin: null };

class TestCommitMessageCodec extends CommitMessageCodecPort {
  encodePatch(_message: PatchCommitMessage): string {
    return 'patch';
  }

  decodePatch(_message: string): PatchCommitMessage {
    return {
      kind: 'patch',
      graph: 'graph',
      writer: 'writer',
      lamport: 1,
      patchHandle: new AssetHandle(
        `git-cas:1:asset:manifest-tree:cbor:sha1:${'a'.repeat(40)}`,
      ),
      schema: 1,
      storage: createGitCasPatchStorage({ encrypted: false }),
    };
  }

  encodeCheckpoint(_message: CheckpointCommitMessage): string {
    return 'checkpoint';
  }

  decodeCheckpoint(_message: string): CheckpointCommitMessage {
    return {
      kind: 'checkpoint',
      graph: 'graph',
      stateHash: 'b'.repeat(64),
      schema: 1,
      checkpointVersion: null,
      bundleHandle: new BundleHandle('bundle:test'),
    };
  }

  encodeAnchor(_message: AnchorCommitMessage): string {
    return 'anchor';
  }

  decodeAnchor(_message: string): AnchorCommitMessage {
    return { kind: 'anchor', graph: 'graph', schema: 1 };
  }

  detectKind(_message: string): CommitMessageKind | null {
    return null;
  }
}

class TestTrustCrypto extends TrustCryptoPort {
  verifySignature(_params: TrustSignatureVerification): boolean {
    return true;
  }

  computeKeyFingerprint(_publicKeyBase64: string): string {
    return 'sha256:test';
  }
}

async function loadResolvers() {
  return await import('../../../../src/domain/warp/RuntimeHostPortResolvers.ts');
}

describe('RuntimeHostPortResolvers', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(async () => {
    vi.resetModules();
    const { installDefaultRuntimeHostNodePorts } = await import(
      '../../../../src/application/RuntimeHostNodeDefaults.ts'
    );
    installDefaultRuntimeHostNodePorts();
  });

  it('returns explicit ports before consulting runtime default resolvers', async () => {
    const resolvers = await loadResolvers();
    const commitMessageCodec = new TestCommitMessageCodec();
    const codec = createFakeCodecPort();
    const crypto = createMockCrypto();
    const trustCrypto = new TestTrustCrypto();
    const history = new InMemoryGraphAdapter();
    const runtimeStorage = new MemoryRuntimeStorageAdapter({ history });

    await expect(resolvers.resolveConfiguredCommitMessageCodec(commitMessageCodec))
      .resolves.toBe(commitMessageCodec);
    await expect(resolvers.resolveConfiguredCodec(codec)).resolves.toBe(codec);
    await expect(resolvers.resolveConfiguredCrypto(crypto)).resolves.toBe(crypto);
    const random = new SequenceRandomPort();
    await expect(resolvers.resolveConfiguredRandom(random)).resolves.toBe(random);
    await expect(resolvers.resolveConfiguredTrustCrypto(trustCrypto, TRUST_ENFORCE))
      .resolves.toBe(trustCrypto);
    await expect(resolvers.resolveConfiguredRuntimeStorage(runtimeStorage))
      .resolves.toBe(runtimeStorage);
  });

  it('rejects missing runtime codec and crypto resolvers', async () => {
    const resolvers = await loadResolvers();

    await expect(resolvers.resolveConfiguredCodec(undefined)).rejects.toMatchObject({
      code: 'E_CODEC_REQUIRED',
    });
    await expect(resolvers.resolveConfiguredCrypto(undefined)).rejects.toMatchObject({
      code: 'E_CRYPTO_REQUIRED',
    });
    await expect(resolvers.resolveConfiguredRandom(undefined)).rejects.toMatchObject({
      code: 'E_RANDOM_REQUIRED',
      message: expect.stringMatching(/RandomPort.*HostRandomAdapter.*install the default runtime ports/u),
    });
  });

  it('rejects a missing commit message codec when no resolver is installed', async () => {
    const resolvers = await loadResolvers();

    await expect(resolvers.resolveConfiguredCommitMessageCodec(undefined)).rejects.toMatchObject({ code: 'E_MESSAGE_CODEC_REQUIRED' });
  });

  it('installs host entropy with the node runtime defaults', async () => {
    const resolvers = await loadResolvers();
    const { installDefaultRuntimeHostNodePorts } = await import(
      '../../../../src/application/RuntimeHostNodeDefaults.ts'
    );

    installDefaultRuntimeHostNodePorts();

    const random = await resolvers.resolveConfiguredRandom(undefined);
    expect(random.constructor.name).toBe(HostRandomAdapter.name);
    expect(random.randomBytes(8)).toHaveLength(8);
  });

  it.each([undefined, null])('rejects missing runtime storage %s', async (runtimeStorage) => {
    const resolvers = await loadResolvers();

    await expect(
      resolvers.resolveConfiguredRuntimeStorage(runtimeStorage),
    ).rejects.toMatchObject({ code: 'E_RUNTIME_STORAGE_REQUIRED' });
  });

  it('keeps runtime storage explicit when browser defaults are installed', async () => {
    const resolvers = await loadResolvers();
    const { installDefaultRuntimeHostBrowserPorts } = await import(
      '../../../../src/application/RuntimeHostBrowserDefaults.ts'
    );

    installDefaultRuntimeHostBrowserPorts();

    await expect(resolvers.resolveConfiguredCodec(undefined)).resolves.toBeDefined();
    await expect(resolvers.resolveConfiguredCrypto(undefined)).resolves.toBeDefined();
    await expect(resolvers.resolveConfiguredRandom(undefined)).resolves.toBeDefined();
    await expect(
      resolvers.resolveConfiguredRuntimeStorage(undefined),
    ).rejects.toMatchObject({ code: 'E_RUNTIME_STORAGE_REQUIRED' });
  });

  it('only requires trust crypto when trust mode is enabled', async () => {
    const resolvers = await loadResolvers();

    await expect(resolvers.resolveConfiguredTrustCrypto(undefined, TRUST_OFF))
      .resolves.toBeUndefined();
    await expect(resolvers.resolveConfiguredTrustCrypto(undefined, TRUST_ENFORCE))
      .rejects.toMatchObject({ code: 'E_TRUST_CRYPTO_REQUIRED' });
  });
});
