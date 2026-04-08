/**
 * Shared options types for warp methods.
 * @module domain/types/WarpOptions
 */

import type HttpServerPort from '../../ports/HttpServerPort.js';
import type CryptoPort from '../../ports/CryptoPort.js';
import type LoggerPort from '../../ports/LoggerPort.js';

export type ServeOptions = {
  port: number;
  host?: string;
  path?: string;
  maxRequestBytes?: number;
  httpPort: HttpServerPort;
  auth?: {
    keys: Record<string, string>;
    mode?: 'enforce' | 'log-only';
    crypto?: CryptoPort;
    logger?: LoggerPort;
    wallClockMs?: () => number;
  };
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
