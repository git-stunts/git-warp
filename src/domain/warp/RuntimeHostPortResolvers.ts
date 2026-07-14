import { requireCommitMessageCodec } from '../services/codec/CommitMessageCodecRequirement.ts';
import WarpError from '../errors/WarpError.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type CommitMessageCodecPort from '../../ports/CommitMessageCodecPort.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import type TrustCryptoPort from '../../ports/TrustCryptoPort.ts';
import type RuntimeStorageProviderPort from '../../ports/RuntimeStorageProviderPort.ts';
import type { NormalizedTrustConfig } from '../runtimeHelpers.ts';

export type CommitMessageCodecResolver = () => CommitMessageCodecPort | Promise<CommitMessageCodecPort>;
export type RuntimeHostCodecResolver = () => CodecPort | Promise<CodecPort>;
export type RuntimeHostCryptoResolver = () => CryptoPort | Promise<CryptoPort>;
export type RuntimeHostTrustCryptoResolver = () => TrustCryptoPort | Promise<TrustCryptoPort>;
let runtimeHostCommitMessageCodecResolver: CommitMessageCodecResolver | null = null;
let runtimeHostCodecResolver: RuntimeHostCodecResolver | null = null;
let runtimeHostCryptoResolver: RuntimeHostCryptoResolver | null = null;
let runtimeHostTrustCryptoResolver: RuntimeHostTrustCryptoResolver | null = null;

export function installRuntimeHostCommitMessageCodecResolver(
  resolver: CommitMessageCodecResolver,
): void {
  runtimeHostCommitMessageCodecResolver = resolver;
}

export function installRuntimeHostCodecResolver(resolver: RuntimeHostCodecResolver): void {
  runtimeHostCodecResolver = resolver;
}

export function installRuntimeHostCryptoResolver(resolver: RuntimeHostCryptoResolver): void {
  runtimeHostCryptoResolver = resolver;
}

export function installRuntimeHostTrustCryptoResolver(resolver: RuntimeHostTrustCryptoResolver): void {
  runtimeHostTrustCryptoResolver = resolver;
}

export async function resolveConfiguredCommitMessageCodec(
  commitMessageCodec: CommitMessageCodecPort | undefined,
): Promise<CommitMessageCodecPort> {
  if (commitMessageCodec !== undefined) {
    return commitMessageCodec;
  }
  const resolvedCodec = runtimeHostCommitMessageCodecResolver === null
    ? undefined
    : await runtimeHostCommitMessageCodecResolver();
  return requireCommitMessageCodec(resolvedCodec);
}

export async function resolveConfiguredCodec(codec: CodecPort | undefined): Promise<CodecPort> {
  if (codec !== undefined) {
    return codec;
  }
  if (runtimeHostCodecResolver === null) {
    throw new WarpError('codec is required at the runtime boundary', 'E_CODEC_REQUIRED');
  }
  return await runtimeHostCodecResolver();
}

export async function resolveConfiguredCrypto(crypto: CryptoPort | undefined): Promise<CryptoPort> {
  if (crypto !== undefined) {
    return crypto;
  }
  if (runtimeHostCryptoResolver === null) {
    throw new WarpError('crypto is required at the runtime boundary', 'E_CRYPTO_REQUIRED');
  }
  return await runtimeHostCryptoResolver();
}

export async function resolveConfiguredTrustCrypto(
  trustCrypto: TrustCryptoPort | undefined,
  normalizedTrust: NormalizedTrustConfig,
): Promise<TrustCryptoPort | undefined> {
  if (trustCrypto !== undefined) {
    return trustCrypto;
  }
  if (normalizedTrust.mode === 'off') {
    return undefined;
  }
  if (runtimeHostTrustCryptoResolver === null) {
    throw new WarpError('trustCrypto is required when trust mode is enabled', 'E_TRUST_CRYPTO_REQUIRED');
  }
  return await runtimeHostTrustCryptoResolver();
}

export function resolveConfiguredRuntimeStorage(
  runtimeStorage: RuntimeStorageProviderPort | null | undefined,
): Promise<RuntimeStorageProviderPort> {
  if (runtimeStorage !== null && runtimeStorage !== undefined) {
    return Promise.resolve(runtimeStorage);
  }
  return Promise.reject(new WarpError(
    'runtime storage is required at the runtime boundary',
    'E_RUNTIME_STORAGE_REQUIRED',
  ));
}
