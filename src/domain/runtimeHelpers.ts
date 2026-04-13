/**
 * Module-level helpers used by WarpRuntime.open() and the constructor.
 *
 * Extracted from the monolithic WarpRuntime.ts as part of the
 * TypeScript migration.
 *
 * @module domain/runtimeHelpers
 */

import type BlobStoragePort from '../ports/BlobStoragePort.ts';
import type IndexStorePort from '../ports/IndexStorePort.ts';
import type CodecPort from '../ports/CodecPort.ts';
import type ClockPort from '../ports/ClockPort.ts';
import type EffectSinkPort from '../ports/EffectSinkPort.ts';
import type { ExternalizationPolicy } from './types/ExternalizationPolicy.ts';
import type { EffectPipeline } from './services/EffectPipeline.ts';

import InMemoryBlobStorageAdapter from './utils/defaultBlobStorage.ts';
import WarpError from './errors/WarpError.ts';

export const DEFAULT_ADJACENCY_CACHE_SIZE = 3;

/**
 * Auto-constructs a BlobStoragePort when none is explicitly provided.
 *
 * When persistence has `plumbing` (Git-backed), constructs a CasBlobAdapter
 * for CDC chunking and Git-native GC reachability. Otherwise uses
 * InMemoryBlobStorageAdapter for browser/test paths.
 */
export async function autoConstructBlobStorage(
  persistence: unknown,
): Promise<BlobStoragePort> {
  const p = persistence as { plumbing?: unknown };
  if (p.plumbing !== null && p.plumbing !== undefined) {
    const { default: CasBlobAdapter } = await import(
      /* webpackIgnore: true */ '../infrastructure/adapters/CasBlobAdapter.ts'
    );
    return new CasBlobAdapter({
      plumbing: p.plumbing,
      persistence: persistence as import('../infrastructure/adapters/CasBlobAdapter.ts').BlobPersistence,
    });
  }
  return new InMemoryBlobStorageAdapter();
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
  sinks: EffectSinkPort[],
  lens: ExternalizationPolicy | undefined,
  clock: ClockPort,
): Promise<EffectPipeline> {
  const multMod = await import('./services/MultiplexSink.ts') as {
    MultiplexSink: typeof import('./services/MultiplexSink.ts').MultiplexSink;
  };
  const effMod = await import('./services/EffectPipeline.ts') as {
    EffectPipeline: typeof import('./services/EffectPipeline.ts').EffectPipeline;
  };
  const mux = new multMod.MultiplexSink();
  for (const sink of sinks) {
    mux.addSink(sink);
  }
  let resolvedLens: ExternalizationPolicy;
  if (lens !== null && lens !== undefined) {
    resolvedLens = lens;
  } else {
    const mod = await import('./types/ExternalizationPolicy.ts') as {
      LIVE_LENS: ExternalizationPolicy;
    };
    resolvedLens = mod.LIVE_LENS;
  }
  return new effMod.EffectPipeline({ sink: mux, lens: resolvedLens, clock });
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
