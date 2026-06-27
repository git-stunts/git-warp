/**
 * Browser entry point for @git-stunts/git-warp.
 *
 * Re-exports only browser-safe code — no node:crypto, node:stream,
 * or @git-stunts/plumbing imports. Use with InMemoryGraphAdapter
 * and WebCryptoAdapter for fully in-browser WARP graph operation.
 *
 * @module browser
 *
 * @example
 * ```js
 * import {
 *   WarpApp,
 *   InMemoryGraphAdapter,
 *   WebCryptoAdapter,
 *   generateWriterId,
 * } from '@git-stunts/git-warp/browser';
 * import { sha1sync } from '@git-stunts/git-warp/sha1sync';
 *
 * const adapter = new InMemoryGraphAdapter({ hash: sha1sync });
 * const crypto = new WebCryptoAdapter();
 * const app = await WarpApp.open({
 *   persistence: adapter,
 *   graphName: 'demo',
 *   writerId: generateWriterId(),
 *   crypto,
 * });
 * ```
 */

import { installDefaultRuntimeHostCommitMessageCodec } from './src/application/RuntimeHostCommitMessageCodecDefaults.ts';

installDefaultRuntimeHostCommitMessageCodec();

// Core API
export { default as WarpApp } from './src/domain/WarpApp.ts';
export { default as WarpCore } from './src/domain/WarpCore.ts';
export { default as GraphNode } from './src/domain/entities/GraphNode.ts';

// Browser-compatible adapters
export { default as InMemoryGraphAdapter } from './src/infrastructure/adapters/InMemoryGraphAdapter.ts';
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
