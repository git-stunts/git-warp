/**
 * Sync operations: frontier exchange, request/response protocol, serve.
 *
 * 9 methods covering the full sync lifecycle.
 */

import type { WarpState } from '../services/JoinReducer.ts';
import type { DecodedPatch } from '../services/sync/syncPatchLoader.ts';
import type SyncSecret from '../services/sync/SyncSecret.ts';
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
  auth?: { keys: Record<string, SyncSecret>; mode?: 'enforce' | 'log-only' };
  allowedWriters?: string[];
};

/** Handle returned by serve(). */
export type ServeHandle = {
  close(): Promise<void>;
  url: string;
};

export default abstract class SyncCapability {
  abstract getFrontier(): Promise<Map<string, string>>;
  abstract hasFrontierChanged(): Promise<boolean>;
  abstract status(): Promise<WarpStatus>;
  abstract createSyncRequest(): Promise<SyncRequest>;
  abstract processSyncRequest(_request: SyncRequest): Promise<SyncResponse>;
  abstract applySyncResponse(_response: SyncResponse): Promise<ApplySyncResult>;
  abstract syncNeeded(_remoteFrontier: Map<string, string>): Promise<boolean>;
  abstract syncWith(_remote: SyncRemote, _options?: SyncWithOptions): Promise<SyncWithResult>;
  abstract serve(_options: ServeOptions): Promise<ServeHandle>;
}
