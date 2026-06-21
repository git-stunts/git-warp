import { assert, describe, expect, it } from 'vitest';
import EncryptionError from '../../../../src/domain/errors/EncryptionError.ts';
import CasContentEncryptionPolicy, {
  mapCasContentEncryptionError,
  type CasVaultResolutionWitness,
} from '../../../../src/infrastructure/adapters/CasContentEncryptionPolicy.ts';

function verifiedVault(overrides: Partial<CasVaultResolutionWitness> = {}): CasVaultResolutionWitness {
  return {
    vaultSlug: 'graphs/team/content',
    keyId: 'content-key-1',
    verification: 'verified',
    rotationEpoch: 1,
    encryptionCount: 3,
    encryptionCountLimit: 100,
    privacyMode: true,
    ...overrides,
  };
}

function requireKey(key: Uint8Array | undefined): Uint8Array {
  assert.isDefined(key);
  return key;
}

describe('CasContentEncryptionPolicy', () => {
  it('keeps disabled content encryption empty at the git-cas boundary', () => {
    const policy = CasContentEncryptionPolicy.disabled();

    expect(policy.enabled).toBe(false);
    expect(policy.scheme).toBeNull();
    expect(policy.vaultDiagnostics()).toBeNull();
    expect(policy.toStoreOptions()).toEqual({});
    expect(policy.toRestoreOptions()).toEqual({});
  });

  it('exposes a vault-resolved framed policy without sharing the caller key object', () => {
    const key = new Uint8Array(32).fill(7);
    const policy = CasContentEncryptionPolicy.fromResolvedVaultKey({
      encryptionKey: key,
      scheme: 'framed',
      frameBytes: 65536,
      vault: verifiedVault(),
    });

    expect(policy.enabled).toBe(true);
    expect(policy.scheme).toBe('framed');
    expect(policy.vaultDiagnostics()).toEqual({
      vaultSlug: 'graphs/team/content',
      keyId: 'content-key-1',
      rotationEpoch: 1,
      encryptionCount: 3,
      encryptionCountLimit: 100,
      privacyMode: true,
    });
    expect(policy.toStoreOptions()).toEqual({
      encryptionKey: key,
      encryption: { scheme: 'framed', frameBytes: 65536 },
    });
    expect(policy.toStoreOptions().encryptionKey).not.toBe(key);
    expect(policy.toRestoreOptions().encryptionKey).not.toBe(key);
  });

  it('does not share internal resolved key buffers or exported option buffers', () => {
    const originalKey = new Uint8Array(32).fill(5);
    const expectedKey = new Uint8Array(32).fill(5);
    const policy = CasContentEncryptionPolicy.fromInternalResolvedKey({
      encryptionKey: originalKey,
      scheme: 'whole',
    });

    originalKey[0] = 99;
    const firstStoreKey = requireKey(policy.toStoreOptions().encryptionKey);
    const firstRestoreKey = requireKey(policy.toRestoreOptions().encryptionKey);

    expect(firstStoreKey).toEqual(expectedKey);
    expect(firstRestoreKey).toEqual(expectedKey);
    expect(firstStoreKey).not.toBe(originalKey);
    expect(firstRestoreKey).not.toBe(originalKey);
    expect(firstStoreKey).not.toBe(firstRestoreKey);

    firstStoreKey[1] = 88;

    expect(requireKey(policy.toStoreOptions().encryptionKey)).toEqual(expectedKey);
    expect(requireKey(policy.toRestoreOptions().encryptionKey)).toEqual(expectedKey);
  });

  it('rejects failed vault passphrase verification', () => {
    expect(() => CasContentEncryptionPolicy.fromResolvedVaultKey({
      encryptionKey: new Uint8Array(32),
      scheme: 'whole',
      vault: verifiedVault({ verification: 'failed-passphrase' }),
    })).toThrowError(
      expect.objectContaining({ code: 'E_CAS_VAULT_PASSPHRASE_FAILED' }),
    );
  });

  it('rejects missing vault metadata before raw key bytes reach git-cas', () => {
    expect(() => CasContentEncryptionPolicy.fromResolvedVaultKey({
      encryptionKey: new Uint8Array(32),
      scheme: 'whole',
      vault: verifiedVault({ verification: 'missing-metadata' }),
    })).toThrowError(
      expect.objectContaining({ code: 'E_CAS_VAULT_METADATA_MISSING' }),
    );
  });

  it('rejects vault writes that require rotation', () => {
    expect(() => CasContentEncryptionPolicy.fromResolvedVaultKey({
      encryptionKey: new Uint8Array(32),
      scheme: 'convergent',
      vault: verifiedVault({ encryptionCount: 100, encryptionCountLimit: 100 }),
    })).toThrowError(
      expect.objectContaining({ code: 'E_CAS_VAULT_ROTATION_REQUIRED' }),
    );
  });

  it('rejects legacy git-cas schemes with migration guidance', () => {
    expect(() => CasContentEncryptionPolicy.fromResolvedVaultKey({
      encryptionKey: new Uint8Array(32),
      scheme: 'whole-v1',
      vault: verifiedVault(),
    })).toThrowError(
      expect.objectContaining({
        code: 'E_CAS_LEGACY_ENCRYPTION_SCHEME',
        message: expect.stringContaining('Legacy git-cas encryption scheme'),
      }),
    );
  });

  it('maps upstream legacy scheme errors to the git-warp migration error', () => {
    const upstream = Object.assign(new Error('Legacy encryption scheme "whole-v1" is no longer supported'), {
      code: 'LEGACY_SCHEME',
    });

    const mapped = mapCasContentEncryptionError(upstream, 'content-attachment');

    expect(mapped).toBeInstanceOf(EncryptionError);
    expect(mapped).toMatchObject({
      code: 'E_CAS_LEGACY_ENCRYPTION_SCHEME',
      context: {
        surface: 'content-attachment',
        upstreamCode: 'LEGACY_SCHEME',
      },
    });
  });
});
