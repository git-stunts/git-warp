/**
 * Sync operations: frontier exchange, request/response protocol, serve.
 *
 * 9 methods covering the full sync lifecycle.
 */

import type { WarpState } from '../services/JoinReducer.ts';
import type { DecodedPatch } from '../services/sync/syncPatchLoader.ts';
import type SyncSecret from '../services/sync/SyncSecret.ts';
import type { SyncRateLimitConfig } from '../services/sync/SyncRateLimiter.ts';
import type HttpServerPort from '../../ports/HttpServerPort.ts';

/** Lightweight status snapshot. */
export type WarpStatus = {
  cachedState: 'fresh' | 'stale' | 'none';
  patchesSinceCheckpoint: number;
  tombstoneRatio: number;
  writers: number;
  frontier: Record<string, string>;
};

/** Sync request message. */
export type SyncRequest = {
  type: 'sync-request';
  frontier: Record<string, string>;
};

/** Sync response message. */
export type SyncResponse = {
  type: 'sync-response';
  frontier: Record<string, string>;
  patches: Array<{ writerId: string; sha: string; patch: DecodedPatch }>;
};

/** Trust options for sync verification. */
export type SyncTrustOptions = {
  mode?: 'off' | 'log-only' | 'enforce';
  pin?: string | null;
};

/** Direct in-process sync peer. */
export type SyncRequestProcessor = {
  processSyncRequest(_request: SyncRequest): Promise<SyncResponse>;
};

/** Public capability bag peer that carries a sync processor. */
export type SyncPeer = {
  readonly sync: SyncRequestProcessor;
};

/** Remote accepted by syncWith(). */
export type SyncRemote = string | SyncRequestProcessor | SyncPeer;

/** Options for syncWith(). */
export type SyncWithOptions = {
  path?: string;
  retries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  onStatus?: (_event: {
    type: string;
    attempt: number;
    durationMs?: number;
    status?: number;
    error?: Error;
  }) => void;
  auth?: { secret: SyncSecret; keyId?: string };
  trust?: SyncTrustOptions;
  /** Compatibility convenience: materialize after sync for legacy callers. */
  materialize?: boolean;
};

/** Result of applySyncResponse(). */
export type ApplySyncResult = {
  state: WarpState;
  frontier: Map<string, string>;
  applied: number;
  writersApplied?: string[];
  skippedWriters: Array<{ writerId: string; reason: string; localSha: string; remoteSha: string | null }>;
};

/** Result of syncWith(). */
export type SyncWithResult = {
  applied: number;
  attempts: number;
  skippedWriters: Array<{ writerId: string; reason: string; localSha: string; remoteSha: string | null }>;
  state?: WarpState;
};

/** Options for serve(). */
export type ServeOptions = {
  port: number;
  host?: string;
  path?: string;
  maxRequestBytes?: number;
  httpPort: HttpServerPort;
  auth?: { keys: Record<string, SyncSecret>; mode?: 'enforce' | 'log-only'; rateLimit?: SyncRateLimitConfig };
  unsafeAllowUnauthenticatedLocalhost?: boolean;
  allowedWriters?: string[];
};

/** Handle returned by serve(). */
export type ServeHandle = {
  close(): Promise<void>;
  url: string;
};

export default abstract class SyncCapability {
  /** Return the local writer frontier. */
  abstract getFrontier(): Promise<Map<string, string>>;

  /** Return whether the local frontier has changed since the last check. */
  abstract hasFrontierChanged(): Promise<boolean>;

  /** Return a lightweight local sync status snapshot. */
  abstract status(): Promise<WarpStatus>;

  /** Create a sync request from the local frontier. */
  abstract createSyncRequest(): Promise<SyncRequest>;

  /** Process an incoming sync request and return missing patches. */
  abstract processSyncRequest(_request: SyncRequest): Promise<SyncResponse>;

  /** Apply patches from a sync response to local state. */
  abstract applySyncResponse(_response: SyncResponse): Promise<ApplySyncResult>;

  /** Return whether syncing is needed for a remote frontier. */
  abstract syncNeeded(_remoteFrontier: Map<string, string>): Promise<boolean>;

  /** Sync with an in-process peer, public capability peer, or remote URL. */
  abstract syncWith(_remote: SyncRemote, _options?: SyncWithOptions): Promise<SyncWithResult>;

  /** Serve sync requests over a supplied HTTP server port. */
  abstract serve(_options: ServeOptions): Promise<ServeHandle>;
}
