/**
 * Browser entry point for @git-stunts/git-warp.
 *
 * Re-exports only browser-safe code — no node:crypto, node:stream,
 * or @git-stunts/plumbing imports.
 */

export { WarpApp, WarpCore } from './index';
export {
  GraphNode,
  InMemoryGraphAdapter,
  WebCryptoAdapter,
  EncryptionError,
  ForkError,
  QueryError,
  StorageError,
  TraversalError,
  SyncError,
} from './index';

/**
 * Base error class for all WARP domain errors.
 */
export class WarpError extends Error {
  readonly name: string;
  readonly code: string;
  readonly context: Record<string, unknown>;
  constructor(message: string, options?: { code?: string; context?: Record<string, unknown> });
}

/**
 * Creates an empty VersionVector (Map<string, number>).
 */
export function createVersionVector(): Map<string, number>;

/**
 * Generates a new canonical writer ID.
 *
 * @param options - Options with optional custom RNG for testing
 * @returns A canonical writer ID (e.g., 'w_0123456789abcdefghjkmnpqrs')
 */
export function generateWriterId(options?: { randomBytes?: (n: number) => Uint8Array }): string;
