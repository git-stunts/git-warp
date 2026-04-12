/**
 * SyncController - Encapsulates all sync functionality for WarpRuntime.
 *
 * Extracted from the original sync.methods.js free functions into a
 * service class. WarpRuntime.prototype delegates directly to this controller
 * via defineProperty loops — no intermediate stub file.
 *
 * @module domain/services/controllers/SyncController
 */

import SyncError from '../../errors/SyncError.ts';
import OperationAbortedError from '../../errors/OperationAbortedError.ts';
import { QueryError, E_NO_STATE_MSG } from '../../warp/_internal.ts';
import { validateSyncResponse } from '../sync/SyncPayloadSchema.js';
import {
  createSyncRequest as createSyncRequestImpl,
  processSyncRequest as processSyncRequestImpl,
  applySyncResponse as applySyncResponseImpl,
  syncNeeded as syncNeededImpl,
  type SyncRequest,
  type SyncResponse,
} from '../sync/SyncProtocol.ts';
import { retry, timeout, RetryExhaustedError, TimeoutError, type RetryOptions } from '@git-stunts/alfred';
import { checkAborted } from '../../utils/cancellation.ts';
import { createFrontier, updateFrontier } from '../Frontier.ts';
import { buildWriterRef } from '../../utils/RefLayout.ts';
import GCMetrics from '../GCMetrics.ts';
import SyncTrustGate from '../sync/SyncTrustGate.js';
import { launchSyncServer, type ServeOptions, type ServerHandle } from './SyncServerLauncher.ts';
import { isError } from '../../types/WarpErrors.ts';
import type { WarpState } from '../JoinReducer.ts';
import type { CorePersistence } from '../../types/WarpPersistence.ts';
import type ClockPort from '../../../ports/ClockPort.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import type PatchJournalPort from '../../../ports/PatchJournalPort.ts';
import type BlobStoragePort from '../../../ports/BlobStoragePort.ts';
import {
  mapsEqual,
  resolveSyncTarget,
  resolveSyncTrustGate,
  buildSyncAuthHeaders,
} from './syncHelpers.ts';

// ── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_SYNC_WITH_RETRIES = 3;
const DEFAULT_SYNC_WITH_BASE_DELAY_MS = 250;
const DEFAULT_SYNC_WITH_MAX_DELAY_MS = 2000;
const DEFAULT_SYNC_WITH_TIMEOUT_MS = 10_000;

// ── SyncHost interface ───────────────────────────────────────────────────────

/**
 * The host interface that SyncController depends on.
 *
 * Documents the exact WarpRuntime surface the controller accesses,
 * making the coupling explicit and enabling lightweight mock hosts
 * in unit tests.
 */
export interface SyncHost {
  _cachedState: WarpState | null;
  _lastFrontier: Map<string, string> | null;
  _stateDirty: boolean;
  _patchesSinceGC: number;
  _graphName: string;
  _persistence: CorePersistence;
  _clock: ClockPort;
  _codec: CodecPort;
  _crypto: CryptoPort;
  _logger: LoggerPort | null;
  _patchJournal?: PatchJournalPort | null;
  _patchBlobStorage?: BlobStoragePort | null;
  _patchesSinceCheckpoint: number;
  _logTiming: (op: string, t0: number, opts?: { metrics?: string; error?: Error }) => void;
  materialize: (options?: Record<string, unknown>) => Promise<unknown>;
  _setMaterializedState: (state: WarpState) => Promise<unknown>;
  discoverWriters: () => Promise<string[]>;
  _createSyncTrustGate?: (
    trust: { mode?: 'off' | 'log-only' | 'enforce'; pin?: string | null } | undefined | null,
  ) => SyncTrustGate | null;
}

// ── Result types ─────────────────────────────────────────────────────────────

export interface SkippedWriter {
  writerId: string;
  reason: string;
  localSha: string;
  remoteSha: string | null;
}

export interface ApplySyncResult {
  state: WarpState;
  frontier: Map<string, string>;
  applied: number;
  trustVerdict?: string;
  writersApplied?: string[];
  skippedWriters: SkippedWriter[];
}

export interface SyncWithResult {
  applied: number;
  attempts: number;
  skippedWriters: SkippedWriter[];
  state?: WarpState;
}

// ── SyncController ──────────────────────────────────────────────────────────

/**
 * Encapsulates all sync-related operations for a WarpRuntime instance.
 */
export default class SyncController {
  readonly _host: SyncHost;
  readonly _trustGate: SyncTrustGate | null;

  /**
   * Creates a new SyncController bound to the given host runtime.
   *
   * @param host - The WarpRuntime instance (or any object satisfying SyncHost)
   * @param options - Optional trust gate configuration
   */
  constructor(host: SyncHost, options: { trustGate?: SyncTrustGate } = {}) {
    this._host = host;
    this._trustGate = options.trustGate ?? null;
  }

  /**
   * Returns the current frontier -- a Map of writerId -> tip SHA.
   *
   * @returns Frontier map
   * @throws If listing refs fails
   */
  async getFrontier(): Promise<Map<string, string>> {
    const writerIds = await this._host.discoverWriters();
    const frontier = createFrontier();

    for (const writerId of writerIds) {
      const writerRef = buildWriterRef(this._host._graphName, writerId);
      const tipSha = await this._host._persistence.readRef(writerRef);
      if (tipSha !== null && tipSha !== undefined && tipSha !== '') {
        updateFrontier(frontier, writerId, tipSha);
      }
    }

    return frontier;
  }

  /**
   * Checks whether any writer tip has changed since the last materialize.
   *
   * O(writers) comparison of stored writer tip SHAs against current refs.
   * Cheap "has anything changed?" check without materialization.
   *
   * @returns True if frontier has changed (or never materialized)
   * @throws If listing refs fails
   */
  async hasFrontierChanged(): Promise<boolean> {
    if (this._host._lastFrontier === null) {
      return true;
    }

    const current = await this.getFrontier();

    if (current.size !== this._host._lastFrontier.size) {
      return true;
    }

    for (const [writerId, tipSha] of current) {
      if (this._host._lastFrontier.get(writerId) !== tipSha) {
        return true;
      }
    }

    return false;
  }

  /**
   * Returns a lightweight status snapshot of the graph's operational state.
   *
   * This method is O(writers) and does NOT trigger materialization.
   *
   * @returns The graph status
   * @throws If listing refs fails
   */
  async status(): Promise<{
    cachedState: 'fresh' | 'stale' | 'none';
    patchesSinceCheckpoint: number;
    tombstoneRatio: number;
    writers: number;
    frontier: Record<string, string>;
  }> {
    // Fetch frontier once, reuse for both staleness check and return value
    const frontier = await this.getFrontier();

    // Determine cachedState
    let cachedState: 'fresh' | 'stale' | 'none';
    if (this._host._cachedState === null) {
      cachedState = 'none';
    } else if (
      this._host._stateDirty ||
      !this._host._lastFrontier ||
      frontier.size !== this._host._lastFrontier.size ||
      !mapsEqual(frontier, this._host._lastFrontier)
    ) {
      cachedState = 'stale';
    } else {
      cachedState = 'fresh';
    }

    // patchesSinceCheckpoint
    const patchesSinceCheckpoint = this._host._patchesSinceCheckpoint;

    // tombstoneRatio
    let tombstoneRatio = 0;
    if (this._host._cachedState) {
      const metrics = GCMetrics.fromState(this._host._cachedState);
      tombstoneRatio = metrics.tombstoneRatio;
    }

    // writers
    const writers = frontier.size;

    // Convert frontier Map to plain object
    const frontierObj = Object.fromEntries(frontier);

    return {
      cachedState,
      patchesSinceCheckpoint,
      tombstoneRatio,
      writers,
      frontier: frontierObj,
    };
  }

  /**
   * Creates a sync request to send to a remote peer.
   * The request contains the local frontier for comparison.
   *
   * @returns The sync request
   * @throws If listing refs fails
   */
  async createSyncRequest(): Promise<SyncRequest> {
    const frontier = await this.getFrontier();
    return createSyncRequestImpl(frontier);
  }

  /**
   * Processes an incoming sync request and returns patches the requester needs.
   *
   * @param request - The incoming sync request
   * @returns The sync response
   * @throws If listing refs or reading patches fails
   */
  async processSyncRequest(request: SyncRequest): Promise<SyncResponse> {
    const localFrontier = await this.getFrontier();
    const persistence: CorePersistence = this._host._persistence;
    return await processSyncRequestImpl(
      request,
      localFrontier,
      persistence,
      this._host._graphName,
      {
        ...(this._host._patchJournal !== null && this._host._patchJournal !== undefined ? { patchJournal: this._host._patchJournal } : {}),
        ...(this._host._logger !== null && this._host._logger !== undefined ? { logger: this._host._logger } : {}),
      },
    );
  }

  /**
   * Applies a sync response to the local graph state.
   * Updates the cached state with received patches.
   *
   * When a trust gate is configured, evaluates patch authors (writersApplied)
   * against trust policy. In enforce mode, untrusted writers cause rejection
   * before any state mutation.
   *
   * **Requires a cached state.**
   *
   * @param response - The sync response
   * @returns Result with updated state and frontier
   * @throws QueryError If no cached state exists (code: `E_NO_STATE`)
   * @throws SyncError If trust gate rejects untrusted writers (code: `E_SYNC_UNTRUSTED_WRITER`)
   */
  async applySyncResponse(response: SyncResponse): Promise<ApplySyncResult> {
    return await this._applySyncResponseWithGate(response, this._trustGate);
  }

  /**
   * Applies a sync response using an explicit trust gate, allowing per-call
   * trust overrides without mutating controller state.
   *
   * @param response - The sync response
   * @param trustGate - Trust gate to use (may differ from the controller's default)
   * @returns Result with updated state and frontier
   */
  private async _applySyncResponseWithGate(
    response: SyncResponse,
    trustGate: SyncTrustGate | null,
  ): Promise<ApplySyncResult> {
    if (!this._host._cachedState) {
      throw new QueryError(E_NO_STATE_MSG, {
        code: 'E_NO_STATE',
      });
    }

    // Extract actual patch authors for trust evaluation (B1)
    const patches = Array.isArray(response.patches) ? response.patches : [];
    const writersApplied = SyncTrustGate.extractWritersFromPatches(patches);

    // Evaluate trust BEFORE applying any patches
    if (trustGate && writersApplied.length > 0) {
      const verdict = await trustGate.evaluate(writersApplied, {
        graphName: this._host._graphName,
      });
      if (!verdict.allowed) {
        throw new SyncError('Sync rejected: untrusted writer(s)', {
          code: 'E_SYNC_UNTRUSTED_WRITER',
          context: {
            writersApplied,
            untrustedWriters: verdict.untrustedWriters,
            verdict: verdict.verdict,
          },
        });
      }
    }

    const currentFrontier = this._host._lastFrontier ?? createFrontier();
    const result = applySyncResponseImpl(
      response,
      this._host._cachedState,
      currentFrontier,
    ) as { state: WarpState; frontier: Map<string, string>; applied: number };

    // Route through canonical state-install path (B105 / C1 fix).
    // _setMaterializedState sets _cachedState, clears _stateDirty, computes
    // state hash, builds adjacency, and rebuilds indexes via _buildView().
    // Bookkeeping is deferred until after install succeeds so that a failed
    // _setMaterializedState does not leave _lastFrontier/_patchesSinceGC
    // advanced while _cachedState remains stale.
    await this._host._setMaterializedState(result.state);

    // Keep _lastFrontier in sync so hasFrontierChanged() won't misreport stale.
    this._host._lastFrontier = result.frontier;

    // Track patches for GC
    this._host._patchesSinceGC += result.applied;

    const skippedWriters: SkippedWriter[] = Array.isArray(response.skippedWriters)
      ? (response.skippedWriters as SkippedWriter[])
      : [];
    return { ...result, writersApplied, skippedWriters };
  }

  /**
   * Checks if sync is needed with a remote frontier.
   *
   * @param remoteFrontier - The remote peer's frontier
   * @returns True if sync would transfer any patches
   * @throws If listing refs fails
   */
  async syncNeeded(remoteFrontier: Map<string, string>): Promise<boolean> {
    const localFrontier = await this.getFrontier();
    return syncNeededImpl(localFrontier, remoteFrontier);
  }

  /**
   * Syncs with a remote peer (HTTP or direct graph instance).
   *
   * @param remote - URL or peer graph instance
   * @param options - Sync options
   * @returns Sync result with applied patch count, attempt count, and skipped writers
   */
  async syncWith(
    remote: string | object,
    options: {
      path?: string;
      retries?: number;
      baseDelayMs?: number;
      maxDelayMs?: number;
      timeoutMs?: number;
      signal?: AbortSignal;
      onStatus?: (event: {
        type: string;
        attempt: number;
        durationMs?: number;
        status?: number;
        error?: Error;
        delayMs?: number;
      }) => void;
      materialize?: boolean;
      auth?: { secret: string; keyId?: string };
      trust?: { mode?: 'off' | 'log-only' | 'enforce'; pin?: string | null };
    } = {},
  ): Promise<SyncWithResult> {
    const t0 = this._host._clock.now();
    const {
      path = '/sync',
      retries = DEFAULT_SYNC_WITH_RETRIES,
      baseDelayMs = DEFAULT_SYNC_WITH_BASE_DELAY_MS,
      maxDelayMs = DEFAULT_SYNC_WITH_MAX_DELAY_MS,
      timeoutMs = DEFAULT_SYNC_WITH_TIMEOUT_MS,
      signal,
      onStatus,
      materialize: materializeAfterSync = false,
      auth,
      trust,
    } = options;

    const hasPathOverride = Object.prototype.hasOwnProperty.call(options, 'path');
    const { isDirectPeer, targetUrl } = resolveSyncTarget(remote, path, hasPathOverride);
    let attempt = 0;
    const trustGate = resolveSyncTrustGate(this._host, this._trustGate, {
      ...(trust !== undefined ? { trust } : {}),
    });

    const emit = (type: string, payload: Record<string, unknown> = {}): void => {
      if (typeof onStatus === 'function') {
        onStatus({ type, attempt, ...payload } as Parameters<NonNullable<typeof onStatus>>[0]);
      }
    };

    const shouldRetry = (err: unknown): boolean => {
      if (isDirectPeer) { return false; }
      if (err instanceof SyncError) {
        return ['E_SYNC_REMOTE', 'E_SYNC_TIMEOUT', 'E_SYNC_NETWORK'].includes(err.code);
      }
      return err instanceof TimeoutError;
    };

    const executeAttempt = async (): Promise<{
      applied: number;
      attempts: number;
      skippedWriters: SkippedWriter[];
    }> => {
      checkAborted(signal, 'syncWith');
      attempt += 1;
      const attemptStart = this._host._clock.now();
      emit('connecting');
      const request = await this.createSyncRequest();
      emit('requestBuilt');
      let response: SyncResponse;
      if (isDirectPeer) {
        const peer = remote as { processSyncRequest: (req: SyncRequest) => Promise<SyncResponse> };
        emit('requestSent');
        response = await peer.processSyncRequest(request);
        emit('responseReceived');
      } else {
        emit('requestSent');
        const bodyStr = JSON.stringify(request);
        const authHeaders = await buildSyncAuthHeaders({
          auth,
          bodyStr,
          targetUrl: targetUrl as URL,
          crypto: this._host._crypto,
        });
        let res: Response;
        try {
          res = await timeout(timeoutMs, (timeoutSignal: AbortSignal) => {
            const combinedSignal = signal
              ? AbortSignal.any([timeoutSignal, signal])
              : timeoutSignal;
            return fetch((targetUrl as URL).toString(), {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                'accept': 'application/json',
                ...authHeaders,
              },
              body: bodyStr,
              signal: combinedSignal,
            });
          });
        } catch (err) {
          if (isError(err) && err.name === 'AbortError') {
            throw new OperationAbortedError('syncWith', { reason: 'Signal received' });
          }
          if (err instanceof TimeoutError) {
            throw new SyncError('Sync request timed out', {
              code: 'E_SYNC_TIMEOUT',
              context: { timeoutMs },
            });
          }
          throw new SyncError('Network error', {
            code: 'E_SYNC_NETWORK',
            context: { message: isError(err) ? err.message : String(err) },
          });
        }

        emit('responseReceived', { status: res.status });

        if (res.status >= 500) {
          throw new SyncError(`Remote error: ${res.status}`, {
            code: 'E_SYNC_REMOTE',
            context: { status: res.status },
          });
        }

        if (res.status >= 400) {
          throw new SyncError(`Protocol error: ${res.status}`, {
            code: 'E_SYNC_PROTOCOL',
            context: { status: res.status },
          });
        }

        try {
          const rawJson: unknown = await res.json();
          response = rawJson as SyncResponse;
        } catch {
          throw new SyncError('Invalid JSON response', {
            code: 'E_SYNC_PROTOCOL',
            context: { status: res.status },
          });
        }
      }

      // Validate response shape + resource limits via Zod schema (B64).
      // For HTTP responses, always validate — untrusted boundary.
      const validation = validateSyncResponse(response);
      if (!validation.ok) {
        throw new SyncError(`Invalid sync response: ${validation.error}`, {
          code: 'E_SYNC_PAYLOAD_INVALID',
        });
      }

      if (!this._host._cachedState) {
        await this._host.materialize();
        emit('materialized');
      }

      const result =
        trustGate === this._trustGate
          ? await this.applySyncResponse(response)
          : await this._applySyncResponseWithGate(response, trustGate);
      emit('applied', { applied: result.applied });

      const durationMs = this._host._clock.now() - attemptStart;
      emit('complete', { durationMs, applied: result.applied });
      const skippedWriters = Array.isArray(result.skippedWriters) ? result.skippedWriters : [];
      return { applied: result.applied, attempts: attempt, skippedWriters };
    };

    try {
      const syncResult = await retry(executeAttempt, {
        retries,
        delay: baseDelayMs,
        maxDelay: maxDelayMs,
        backoff: 'exponential',
        jitter: 'decorrelated',
        signal,
        shouldRetry,
        onRetry: (error: Error, attemptNumber: number, delayMs: number) => {
          if (typeof onStatus === 'function') {
            onStatus({ type: 'retrying', attempt: attemptNumber, delayMs, error });
          }
        },
      } as RetryOptions);

      this._host._logTiming('syncWith', t0, { metrics: `${syncResult.applied} patches applied` });

      if (materializeAfterSync) {
        if (!this._host._cachedState) { await this._host.materialize(); }
        return { ...syncResult, state: this._host._cachedState as WarpState };
      }
      return syncResult;
    } catch (err) {
      this._host._logTiming('syncWith', t0, { error: err as Error });
      if (isError(err) && err.name === 'AbortError') {
        const abortedError = new OperationAbortedError('syncWith', { reason: 'Signal received' });
        if (typeof onStatus === 'function') {
          onStatus({ type: 'failed', attempt, error: abortedError });
        }
        throw abortedError;
      }
      if (err instanceof RetryExhaustedError) {
        const { cause } = err;
        if (typeof onStatus === 'function') {
          onStatus({ type: 'failed', attempt: err.attempts, error: cause });
        }
        throw cause;
      }
      if (typeof onStatus === 'function') {
        onStatus({ type: 'failed', attempt, error: err as Error });
      }
      throw err;
    }
  }

  /**
   * Starts a built-in sync server for this graph.
   *
   * @param options - Server configuration
   * @returns Server handle with close() method and url string
   * @throws SyncError If port is not a number or httpPort adapter is missing
   */
  async serve(options: ServeOptions): Promise<ServerHandle> {
    return await launchSyncServer(this._host, options);
  }
}
