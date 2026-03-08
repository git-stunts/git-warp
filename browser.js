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
 *   WarpGraph,
 *   InMemoryGraphAdapter,
 *   WebCryptoAdapter,
 *   generateWriterId,
 * } from '@git-stunts/git-warp/browser';
 * import { sha1sync } from '@git-stunts/git-warp/sha1sync';
 *
 * const adapter = new InMemoryGraphAdapter({ hash: sha1sync });
 * const crypto = new WebCryptoAdapter();
 * const graph = await WarpGraph.open({
 *   persistence: adapter,
 *   graphName: 'demo',
 *   writerId: generateWriterId(),
 *   crypto,
 * });
 * ```
 */

// Core API
export { default as WarpGraph } from './src/domain/WarpGraph.js';
export { default as GraphNode } from './src/domain/entities/GraphNode.js';

// Browser-compatible adapters
export { default as InMemoryGraphAdapter } from './src/infrastructure/adapters/InMemoryGraphAdapter.js';
export { default as WebCryptoAdapter } from './src/infrastructure/adapters/WebCryptoAdapter.js';

// CRDT primitives
export { createVersionVector } from './src/domain/crdt/VersionVector.js';

// Errors
export { default as WarpError } from './src/domain/errors/WarpError.js';
export {
  EncryptionError,
  ForkError,
  QueryError,
  StorageError,
  TraversalError,
  SyncError,
} from './src/domain/errors/index.js';

// Utilities
export { generateWriterId } from './src/domain/utils/WriterId.js';
