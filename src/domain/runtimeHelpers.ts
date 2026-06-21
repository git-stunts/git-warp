/**
 * Module-level helpers used by RuntimeHost.open() and the constructor.
 *
 * Extracted from the monolithic runtime host as part of the
 * TypeScript migration.
 *
 * @module domain/runtimeHelpers
 */

import type BlobStoragePort from '../ports/BlobStoragePort.ts';
import type IndexStorePort from '../ports/IndexStorePort.ts';
import type CodecPort from '../ports/CodecPort.ts';
import type EffectSinkPort from '../ports/EffectSinkPort.ts';
import type { CorePersistence } from './types/WarpPersistence.ts';
import type { ExternalizationPolicy } from './types/ExternalizationPolicy.ts';
import type { EffectPipeline } from './services/EffectPipeline.ts';
import type { MultiplexSink } from './services/MultiplexSink.ts';
import type RuntimeStorageCapabilityPort from '../ports/RuntimeStorageCapabilityPort.ts';

import InMemoryBlobStorageAdapter from './utils/defaultBlobStorage.ts';
import WarpError from './errors/WarpError.ts';
import {
  LEGACY_EXTERNAL_PATCH_STORAGE,
  LEGACY_GIT_BLOB_PATCH_STORAGE,
  type PatchStorageRoute,
} from '../ports/CommitMessageCodecPort.ts';

export const DEFAULT_ADJACENCY_CACHE_SIZE = 3;

/**
 * Persistence accepted by runtime helper resolution.
 */
type RuntimeStoragePersistence = CorePersistence & Partial<RuntimeStorageCapabilityPort>;

/**
 * Resolves blob storage from an explicit injection, an adapter capability,
 * or the in-memory fallback used by browser/test paths.
 */
export async function resolveBlobStorage(
  blobStorage: BlobStoragePort | undefined | null,
  persistence: RuntimeStoragePersistence,
): Promise<BlobStoragePort> {
  if (blobStorage !== undefined && blobStorage !== null) {
    return blobStorage;
  }
  if (typeof persistence.createRuntimeBlobStorage === 'function') {
    return await persistence.createRuntimeBlobStorage();
  }
  return new InMemoryBlobStorageAdapter();
}

/**
 * Resolves the default storage route for newly written patches.
 */
export function resolvePatchWriteStorage(
  persistence: RuntimeStoragePersistence,
  patchBlobStorage: BlobStoragePort | undefined | null,
): PatchStorageRoute {
  if (typeof persistence.defaultPatchWriteStorage === 'function') {
    return persistence.defaultPatchWriteStorage();
  }
  return patchBlobStorage !== undefined && patchBlobStorage !== null
    ? LEGACY_EXTERNAL_PATCH_STORAGE
    : LEGACY_GIT_BLOB_PATCH_STORAGE;
}

type IndexStoreDeps = {
  codec: CodecPort;
  blobPort: {
    readBlob(oid: string): Promise<Uint8Array>;
    writeBlob(content: Uint8Array | string): Promise<string>;
  };
  treePort: {
    readTreeOids(treeOid: string): Promise<Record<string, string>>;
    writeTree(entries: string[]): Promise<string>;
  };
  blobStorage?: BlobStoragePort | null;
};

/**
 * Resolves an IndexStorePort: uses the provided instance if present,
 * otherwise auto-constructs a CborIndexStoreAdapter.
 */
export async function resolveIndexStore(
  indexStore: IndexStorePort | undefined | null,
  deps: IndexStoreDeps,
): Promise<IndexStorePort> {
  if (indexStore !== undefined && indexStore !== null) {
    return indexStore;
  }
  const { CborIndexStoreAdapter } = await import(
    /* webpackIgnore: true */ '../infrastructure/adapters/CborIndexStoreAdapter.ts'
  );
  return new CborIndexStoreAdapter(deps);
}

/**
 * Constructs an EffectPipeline from an array of sinks and an optional externalization lens.
 */
export async function buildEffectPipeline(
  sinks: readonly EffectSinkPort[],
  lens: ExternalizationPolicy | undefined,
): Promise<EffectPipeline> {
  const multMod: { MultiplexSink: typeof MultiplexSink } = await import('./services/MultiplexSink.ts');
  const effMod: { EffectPipeline: typeof EffectPipeline } = await import('./services/EffectPipeline.ts');
  const mux = new multMod.MultiplexSink();
  for (const sink of sinks) {
    mux.addSink(sink);
  }
  let resolvedLens: ExternalizationPolicy;
  if (lens !== null && lens !== undefined) {
    resolvedLens = lens;
  } else {
    const mod = await import('./types/ExternalizationPolicy.ts');
    resolvedLens = mod.LIVE_LENS;
  }
  return new effMod.EffectPipeline({ sink: mux, lens: resolvedLens });
}

const VALID_TRUST_MODES = ['off', 'log-only', 'enforce'] as const;

export type TrustMode = 'off' | 'log-only' | 'enforce';

export type NormalizedTrustConfig = {
  mode: TrustMode;
  pin: string | null;
};

/**
 * Validates and returns the trust mode from a raw config.
 */
export function validateTrustMode(mode: string): TrustMode {
  if (!VALID_TRUST_MODES.includes(mode as TrustMode)) {
    throw new WarpError('trust.mode must be one of: off, log-only, enforce', 'E_TRUST_CONFIG');
  }
  return mode as TrustMode;
}

/**
 * Validates and returns the trust pin from a raw config.
 */
export function validateTrustPin(pin: string | null | undefined): string | null {
  if (pin !== undefined && pin !== null && typeof pin !== 'string') {
    throw new WarpError('trust.pin must be a string', 'E_TRUST_CONFIG');
  }
  return pin ?? null;
}

/**
 * Normalizes a trust configuration into a canonical shape with defaults.
 */
export function normalizeTrustConfig(
  trust: { mode?: TrustMode; pin?: string | null } | undefined | null,
): NormalizedTrustConfig {
  if (trust === null || trust === undefined) {
    return { mode: 'off', pin: null };
  }
  if (typeof trust !== 'object') {
    throw new WarpError('trust must be an object', 'E_TRUST_CONFIG');
  }
  return {
    mode: validateTrustMode(trust.mode ?? 'off'),
    pin: validateTrustPin(trust.pin),
  };
}
