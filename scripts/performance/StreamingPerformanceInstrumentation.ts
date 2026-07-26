import { clearInterval, setInterval } from 'node:timers';
import RuntimeHost from '../../src/domain/RuntimeHost.ts';
import { CborIndexStoreAdapter }
  from '../../src/infrastructure/adapters/CborIndexStoreAdapter.ts';

export type MemorySampler = Readonly<{
  sample: () => void;
  snapshot: () => Readonly<{
    maxRssBytes: number;
    peakHeapUsedBytes: number;
  }>;
  stop: () => void;
}>;

export type PathEvidence = Readonly<{
  restore: () => void;
  snapshot: () => Readonly<{
    materializeCalls: number;
    uniquePropertyPages: number;
    wholeIndexScans: number;
  }>;
}>;

export function installPathEvidence(): PathEvidence {
  const propertyPages = new Set<string>();
  let materializeCalls = 0;
  let wholeIndexScans = 0;
  const originalMaterialize = RuntimeHost.prototype.materialize;
  const originalDecodeShardAt = CborIndexStoreAdapter.prototype.decodeShardAt;
  const originalScanShards = CborIndexStoreAdapter.prototype.scanShards;
  RuntimeHost.prototype.materialize = (async function () {
    materializeCalls += 1;
    await Promise.resolve();
    throw new Error('Streaming proof prohibited RuntimeHost.materialize()');
  }) as typeof originalMaterialize;
  CborIndexStoreAdapter.prototype.decodeShardAt = (async function (
    this: CborIndexStoreAdapter,
    indexHandle,
    path,
    decodeOptions,
  ) {
    if (path.startsWith('props_')) {
      propertyPages.add(`${indexHandle.toString()}:${path}`);
    }
    return await originalDecodeShardAt.call(this, indexHandle, path, decodeOptions);
  }) as typeof originalDecodeShardAt;
  CborIndexStoreAdapter.prototype.scanShards = (function () {
    wholeIndexScans += 1;
    throw new Error('Streaming proof prohibited whole-index shard scanning');
  }) as typeof originalScanShards;
  return Object.freeze({
    restore: () => {
      RuntimeHost.prototype.materialize = originalMaterialize;
      CborIndexStoreAdapter.prototype.decodeShardAt = originalDecodeShardAt;
      CborIndexStoreAdapter.prototype.scanShards = originalScanShards;
    },
    snapshot: () => Object.freeze({
      materializeCalls,
      uniquePropertyPages: propertyPages.size,
      wholeIndexScans,
    }),
  });
}

export function startMemorySampler(): MemorySampler {
  let peakHeapUsedBytes = 0;
  let peakRssBytes = 0;
  const sampleMemory = (): void => {
    const memory = process.memoryUsage();
    peakHeapUsedBytes = Math.max(peakHeapUsedBytes, memory.heapUsed);
    peakRssBytes = Math.max(peakRssBytes, memory.rss);
  };
  const sampler = setInterval(sampleMemory, 5);
  sampler.unref();
  sampleMemory();
  return Object.freeze({
    sample: sampleMemory,
    snapshot: () => Object.freeze({
      maxRssBytes: Math.max(
        peakRssBytes,
        process.resourceUsage().maxRSS * 1024,
      ),
      peakHeapUsedBytes,
    }),
    stop: () => { clearInterval(sampler); },
  });
}
