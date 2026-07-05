/**
 * Browser entry point for @git-stunts/git-warp.
 *
 * Re-exports only browser-safe code without exposing the legacy graph-shaped
 * compatibility API from the browser root. Use `MemoryStorageAdapter` from the
 * storage subpath and `WebCryptoAdapter` here for in-browser operation.
 *
 * @module browser
 *
 * @example
 * ```js
 * import { WebCryptoAdapter, generateWriterId } from '@git-stunts/git-warp/browser';
 * import { MemoryStorageAdapter } from '@git-stunts/git-warp/storage';
 * import { sha1sync } from '@git-stunts/git-warp/sha1sync';
 *
 * const adapter = new MemoryStorageAdapter({ hash: sha1sync });
 * const crypto = new WebCryptoAdapter();
 * ```
 */

import { installDefaultRuntimeHostBrowserPorts } from './src/application/RuntimeHostBrowserDefaults.ts';

installDefaultRuntimeHostBrowserPorts();

export { openWarp } from './src/domain/api/openWarp.ts';
export { default as Warp } from './src/domain/api/Warp.ts';
export { default as Timeline } from './src/domain/api/Timeline.ts';
export type { OpenWarpOptions, WarpStorage } from './src/domain/api/openWarp.ts';

export { default as WebCryptoAdapter } from './src/infrastructure/adapters/WebCryptoAdapter.ts';

// CRDT primitives
export { default as VersionVector } from './src/domain/crdt/VersionVector.ts';
export { default as SyncSecret } from './src/domain/services/sync/SyncSecret.ts';
export type { SyncRateLimitConfig } from './src/domain/services/sync/SyncRateLimiter.ts';

// Errors
export { default as WarpError } from './src/domain/errors/WarpError.ts';
export {
  EncryptionError,
  ForkError,
  QueryError,
  StorageError,
  TraversalError,
  SyncError,
} from './src/domain/errors/index.ts';

// Utilities
export { generateWriterId } from './src/domain/utils/WriterId.ts';
