/**
 * Shared options types for warp methods.
 * @module domain/types/WarpOptions
 */

import type HttpServerPort from '../../ports/HttpServerPort.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import type LoggerPort from '../../ports/LoggerPort.ts';
import type SyncSecret from '../services/sync/SyncSecret.ts';
import type { SyncRateLimitConfig } from '../services/sync/SyncRateLimiter.ts';
import type { SyncPeerRateLimit } from '../services/sync/SyncPeerRateLimiter.ts';

export type ServeOptions = {
  port: number;
  host?: string;
  path?: string;
  maxRequestBytes?: number;
  httpPort: HttpServerPort;
  auth?: {
    keys: Record<string, SyncSecret>;
    mode?: 'enforce' | 'log-only';
    crypto?: CryptoPort;
    logger?: LoggerPort;
    rateLimit?: SyncRateLimitConfig;
  };
  unsafeAllowUnauthenticatedLocalhost?: boolean;
  allowedWriters?: string[];
  /**
   * Pre-authentication limit for each socket peer address. On by default
   * with DEFAULT_SYNC_PEER_RATE_LIMIT (a burst of 60 requests, a refill of 10
   * requests per second, at most 4096 tracked peers); it cannot be turned off.
   */
  peerRateLimit?: SyncPeerRateLimit;
};

export type MaterializeOptions = {
  receipts?: boolean;
  ceiling?: number | null;
};

export type PatchCommitEvent = {
  patch?: unknown; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  sha: string;
};
