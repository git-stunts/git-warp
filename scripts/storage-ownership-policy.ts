export const PRODUCTION_ROOTS = ['src', 'bin'] as const;
export const PRODUCTION_ENTRYPOINTS = [
  'index.ts',
  'advanced.ts',
  'diagnostics.ts',
  'charts.ts',
  'testing.ts',
] as const;
export const DOMAIN_STORAGE_ROOTS = ['src/domain', 'src/ports'] as const;
export const STORAGE_ADAPTER_ROOT = 'src/infrastructure/adapters/';
export const FORBIDDEN_STORAGE_MODULES = new Set(['@git-stunts/git-cas', '@git-stunts/plumbing']);
export const FORBIDDEN_DOMAIN_STORAGE_IDENTIFIERS = new Set([
  'BlobPort',
  'BlobStoragePort',
  'TreePort',
  'createTree',
  'hashObject',
  'readBlob',
  'readManifest',
  'readTree',
  'restoreStream',
  'writeBlob',
  'writeTree',
]);
export const FORBIDDEN_CAS_MANAGEMENT_IDENTIFIERS = new Set([
  'CacheAcquisitionRegistry',
  'CacheIndex',
  'CacheSetRegistry',
  'LRUCache',
  'LruCache',
  'PageCache',
  'RootSet',
  'RootSetRegistry',
  'cacheIndex',
  'pageCache',
  'rootSet',
]);
export const RAW_GIT_OBJECT_WRITE_COMMANDS = new Set([
  'hash-object',
  'mktree',
  'unpack-objects',
  'write-tree',
]);
export const REMOVED_PRODUCTION_SYMBOLS = new Set([
  'CachedValue',
  'CasFirstMemoizationEngine',
  'CasIndexStorageAdapter',
  'CasSeekCacheAdapter',
  'GitTrieStoreAdapter',
  'HealthCheckService',
  'InMemoryBlobStorageAdapter',
  'InMemoryGraphAdapter',
  'IndexRebuildService',
  'IndexStalenessChecker',
  'MemoryRuntimeStorageAdapter',
  'MemoryStorage',
  'SeekCachePort',
  'StreamingBitmapIndexBuilder',
  'StreamingCheckpointBasisBuilder',
  'StreamingIndexStoragePort',
]);
export const REMOVED_PRODUCTION_IDENTIFIERS = new Set([
  '_adjacencyCache',
  '_seekCache',
  'adjacencyCacheSize',
  'buildSeekCacheRef',
  'createSeekCache',
  'defaultBlobStorage',
  'seekCache',
  'setSeekCache',
  'wireSeekCache',
]);
