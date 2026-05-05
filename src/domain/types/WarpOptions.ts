/**
 * Shared options types for warp methods.
 * @module domain/types/WarpOptions
 */

import type HttpServerPort from '../../ports/HttpServerPort.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import type LoggerPort from '../../ports/LoggerPort.ts';
import type SyncSecret from '../services/sync/SyncSecret.ts';
import type { SyncRateLimitConfig } from '../services/sync/SyncRateLimiter.ts';

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
    wallClockMs?: () => number;
    rateLimit?: SyncRateLimitConfig;
  };
  unsafeAllowUnauthenticatedLocalhost?: boolean;
  allowedWriters?: string[];
};

export type MaterializeOptions = {
  receipts?: boolean;
  ceiling?: number | null;
};

export type PatchCommitEvent = {
  patch?: unknown;
  sha: string;
};
