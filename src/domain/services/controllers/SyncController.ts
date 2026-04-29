/**
 * SyncController — encapsulates all sync functionality for WarpRuntime.
 */
import SyncError from '../../errors/SyncError.ts';
import OperationAbortedError from '../../errors/OperationAbortedError.ts';
import QueryError from '../../errors/QueryError.ts';
import { validateSyncResponse } from '../sync/SyncPayloadSchema.ts';
import {
  createSyncRequest as createSyncRequestImpl,
  processSyncRequest as processSyncRequestImpl,
  applySyncResponse as applySyncResponseImpl,
  syncNeeded as syncNeededImpl,
  type SyncRequest,
  type SyncResponse,
} from '../sync/SyncProtocol.ts';
import { retry, RetryExhaustedError, TimeoutError, type RetryOptions } from '@git-stunts/alfred';
import { checkAborted } from '../../utils/cancellation.ts';
import { createFrontier, updateFrontier } from '../Frontier.ts';
import { buildWriterRef } from '../../utils/RefLayout.ts';
import GCMetrics from '../GCMetrics.ts';
import SyncTrustGate from '../sync/SyncTrustGate.ts';
import { launchSyncServer, type ServeOptions, type ServerHandle } from './SyncServerLauncher.ts';
import { isError } from '../../types/WarpErrors.ts';
import type { WarpState } from '../JoinReducer.ts';
import type { CorePersistence } from '../../types/WarpPersistence.ts';
import type SyncHttpClientPort from '../../../ports/SyncHttpClientPort.ts';
import type {
  SyncHttpAuth,
  SyncHttpClientResult,
} from '../../../ports/SyncHttpClientPort.ts';
import type CryptoPort from '../../../ports/CryptoPort.ts';
import {
  mapsEqual,
  resolveSyncTarget,
  resolveSyncTrustGate,
} from './syncHelpers.ts';
import type {
  SyncHost,
  SkippedWriter,
  ApplySyncResult,
  SyncRemote,
  SyncWithResult,
  SyncWithOptions,
} from './SyncControllerTypes.ts';
import { E_NO_STATE_MSG } from './QueryStateMessages.ts';

export type { SyncHost, SkippedWriter, ApplySyncResult, SyncWithResult, SyncWithOptions } from './SyncControllerTypes.ts';

const DEFAULT_SYNC_WITH_RETRIES = 3;
const DEFAULT_SYNC_WITH_BASE_DELAY_MS = 250;
const DEFAULT_SYNC_WITH_MAX_DELAY_MS = 2000;
const DEFAULT_SYNC_WITH_TIMEOUT_MS = 10_000;

/**
 * Optional payload carried alongside `type` and `attempt` in the
 * onStatus callback — the superset of fields every event kind might
 * contribute. Narrower than `SyncStatusEvent` because `type` and
 * `attempt` are injected at the emit site.
 */
type SyncStatusPayload = {
  durationMs?: number;
  status?: number;
  error?: Error;
  delayMs?: number;
  applied?: number;
};

/**
 * Translates an optional caller auth shape into the SyncHttpAuth
 * carried on the transport port. Returns undefined when auth is not
 * configured (adapter skips signing).
 */
function resolveAuth(
  auth: { secret: string; keyId?: string } | undefined,
  crypto: CryptoPort,
  lamport: number,
): SyncHttpAuth | undefined {
  if (auth === undefined || auth.secret === undefined || auth.secret === '') { return undefined; }
  return {
    secret: auth.secret,
    ...(auth.keyId !== undefined && auth.keyId !== '' ? { keyId: auth.keyId } : {}),
    lamport,
    crypto,
  };
}

/**
 * Translates a typed SyncHttpClientResult into the SyncController's
 * throw-based idiom. Success returns the decoded body; failures throw
 * the original SyncError / OperationAbortedError codes that the
 * retry harness understands.
 */
function interpretHttpResult(
  result: SyncHttpClientResult,
  timeoutMs: number,
): SyncResponse {
  if (result.kind === 'success') {
    return result.response;
  }
  if (result.kind === 'timeout') {
    throw new SyncError('Sync request timed out', { code: 'E_SYNC_TIMEOUT', context: { timeoutMs } });
  }
  if (result.kind === 'aborted') {
    throw new OperationAbortedError('syncWith', { reason: 'Signal received' });
  }
  if (result.kind === 'network-failure') {
    throw new SyncError('Network error', {
      code: 'E_SYNC_NETWORK', context: { message: result.message },
    });
  }
  if (result.kind === 'status-failure') {
    if (result.status >= 500) {
      throw new SyncError(`Remote error: ${result.status}`, {
        code: 'E_SYNC_REMOTE', context: { status: result.status },
      });
    }
    throw new SyncError(`Protocol error: ${result.status}`, {
      code: 'E_SYNC_PROTOCOL', context: { status: result.status },
    });
  }
  // decode-failure
  throw new SyncError('Invalid JSON response', {
    code: 'E_SYNC_PROTOCOL', context: { status: result.status },
  });
}

export default class SyncController {
  readonly _host: SyncHost;
  readonly _trustGate: SyncTrustGate | null;
  private _httpClient: SyncHttpClientPort | null;

  constructor(host: SyncHost, options: { trustGate?: SyncTrustGate; httpClient?: SyncHttpClientPort } = {}) {
    this._host = host;
    this._trustGate = options.trustGate ?? null;
    this._httpClient = options.httpClient ?? null;
  }

  /**
   * Lazily resolves the sync HTTP client. Defaults to the platform
   * fetch-based adapter, loaded via dynamic import to keep the
   * `from 'infrastructure/*'` wall clean at the module graph level.
   */
  private async _resolveHttpClient(): Promise<SyncHttpClientPort> {
    if (this._httpClient !== null) { return this._httpClient; }
    const mod = await import('../../../infrastructure/adapters/FetchSyncHttpClientAdapter.ts');
    const adapter = new mod.default();
    this._httpClient = adapter;
    return adapter;
  }

  /** Returns the current frontier — a Map of writerId → tip SHA. */
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

  /** Checks whether any writer tip has changed since the last materialize. */
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

  /** Returns a lightweight status snapshot. O(writers), no materialization. */
  async status(): Promise<{
    cachedState: 'fresh' | 'stale' | 'none';
    patchesSinceCheckpoint: number;
    tombstoneRatio: number;
    writers: number;
    frontier: Record<string, string>;
  }> {
    const frontier = await this.getFrontier();
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
    let tombstoneRatio = 0;
    if (this._host._cachedState) {
      tombstoneRatio = GCMetrics.fromState(this._host._cachedState).tombstoneRatio;
    }
    return {
      cachedState,
      patchesSinceCheckpoint: this._host._patchesSinceCheckpoint,
      tombstoneRatio,
      writers: frontier.size,
      frontier: Object.fromEntries(frontier),
    };
  }

  /** Creates a sync request containing the local frontier. */
  async createSyncRequest(): Promise<SyncRequest> {
    const frontier = await this.getFrontier();
    return createSyncRequestImpl(frontier);
  }

  /** Processes an incoming sync request and returns patches the requester needs. */
  async processSyncRequest(request: SyncRequest): Promise<SyncResponse> {
    const localFrontier = await this.getFrontier();
    const persistence: CorePersistence = this._host._persistence;
    return await processSyncRequestImpl(
      request, localFrontier, persistence, this._host._graphName,
      {
        ...(this._host._patchJournal !== null && this._host._patchJournal !== undefined ? { patchJournal: this._host._patchJournal } : {}),
        ...(this._host._logger !== null && this._host._logger !== undefined ? { logger: this._host._logger } : {}),
      },
    );
  }

  /** Applies a sync response to local state, evaluating trust if configured. */
  async applySyncResponse(response: SyncResponse): Promise<ApplySyncResult> {
    return await this._applySyncResponseWithGate(response, this._trustGate);
  }

  private async _applySyncResponseWithGate(
    response: SyncResponse,
    trustGate: SyncTrustGate | null,
  ): Promise<ApplySyncResult> {
    if (!this._host._cachedState) {
      throw new QueryError(E_NO_STATE_MSG, { code: 'E_NO_STATE' });
    }
    const patches = Array.isArray(response.patches) ? response.patches : [];
    const writersApplied = SyncTrustGate.extractWritersFromPatches(patches);
    if (trustGate && writersApplied.length > 0) {
      const verdict = await trustGate.evaluate(writersApplied, { graphName: this._host._graphName });
      if (!verdict.allowed) {
        throw new SyncError('Sync rejected: untrusted writer(s)', {
          code: 'E_SYNC_UNTRUSTED_WRITER',
          context: { writersApplied, untrustedWriters: verdict.untrustedWriters, verdict: verdict.verdict },
        });
      }
    }
    const currentFrontier = this._host._lastFrontier ?? createFrontier();
    const result = applySyncResponseImpl(
      response, this._host._cachedState, currentFrontier,
    ) as { state: WarpState; frontier: Map<string, string>; applied: number };
    await this._host._setMaterializedState(result.state);
    this._host._lastFrontier = result.frontier;
    this._host._patchesSinceGC += result.applied;
    const skippedWriters: SkippedWriter[] = Array.isArray(response.skippedWriters)
      ? (response.skippedWriters as SkippedWriter[])
      : [];
    return { ...result, writersApplied, skippedWriters };
  }

  /** Checks if sync is needed with a remote frontier. */
  async syncNeeded(remoteFrontier: Map<string, string>): Promise<boolean> {
    const localFrontier = await this.getFrontier();
    return syncNeededImpl(localFrontier, remoteFrontier);
  }

  /** Syncs with a remote peer (HTTP or direct graph instance). */
  async syncWith(remote: SyncRemote, options: SyncWithOptions = {}): Promise<SyncWithResult> {
    const {
      path = '/sync',
      retries = DEFAULT_SYNC_WITH_RETRIES,
      baseDelayMs = DEFAULT_SYNC_WITH_BASE_DELAY_MS,
      maxDelayMs = DEFAULT_SYNC_WITH_MAX_DELAY_MS,
      timeoutMs = DEFAULT_SYNC_WITH_TIMEOUT_MS,
      signal, onStatus,
      materialize: materializeAfterSync = false,
      auth, trust,
    } = options;

    const hasPathOverride = Object.prototype.hasOwnProperty.call(options, 'path');
    const target = resolveSyncTarget(remote, path, hasPathOverride);
    let attempt = 0;
    const trustGate = resolveSyncTrustGate(this._host, this._trustGate, {
      ...(trust !== undefined ? { trust } : {}),
    });

    const emit = (type: string, payload: SyncStatusPayload = {}): void => {
      if (typeof onStatus === 'function') {
        onStatus({ type, attempt, ...payload });
      }
    };

    const shouldRetry = (err: Error): boolean => {
      if (target.kind === 'peer') { return false; }
      if (err instanceof SyncError) {
        return ['E_SYNC_REMOTE', 'E_SYNC_TIMEOUT', 'E_SYNC_NETWORK'].includes(err.code);
      }
      return err instanceof TimeoutError;
    };

    const executeAttempt = async (): Promise<{
      applied: number; attempts: number; skippedWriters: SkippedWriter[];
    }> => {
      checkAborted(signal, 'syncWith');
      attempt += 1;
      emit('connecting');
      const request = await this.createSyncRequest();
      emit('requestBuilt');

      let response: SyncResponse;
      if (target.kind === 'peer') {
        emit('requestSent');
        response = await target.peer.processSyncRequest(request);
        emit('responseReceived');
      } else {
        response = await this._fetchSyncResponse(request, target.targetUrl, timeoutMs, signal, auth, emit);
      }

      const validation = validateSyncResponse(response);
      if (!validation.ok) {
        throw new SyncError(`Invalid sync response: ${validation.error}`, { code: 'E_SYNC_PAYLOAD_INVALID' });
      }
      if (!this._host._cachedState) {
        await this._host._materializeGraph();
        emit('materialized');
      }
      const result = trustGate === this._trustGate
        ? await this.applySyncResponse(response)
        : await this._applySyncResponseWithGate(response, trustGate);
      emit('applied', { applied: result.applied });
      emit('complete', { applied: result.applied });
      const skippedWriters = Array.isArray(result.skippedWriters) ? result.skippedWriters : [];
      return { applied: result.applied, attempts: attempt, skippedWriters };
    };

    try {
      const syncResult = await retry(executeAttempt, {
        retries, delay: baseDelayMs, maxDelay: maxDelayMs,
        backoff: 'exponential', jitter: 'decorrelated', signal, shouldRetry,
        onRetry: (error: Error, attemptNumber: number, delayMs: number) => {
          if (typeof onStatus === 'function') {
            onStatus({ type: 'retrying', attempt: attemptNumber, delayMs, error });
          }
        },
      } as RetryOptions);
      if (materializeAfterSync) {
        if (!this._host._cachedState) { await this._host._materializeGraph(); }
        const state = this._host._cachedState;
        if (state === null) {
          throw new SyncError('Materialize completed without cached state', {
            code: 'E_SYNC_NO_STATE',
          });
        }
        return { ...syncResult, state };
      }
      return syncResult;
    } catch (err) {
      if (isError(err) && err.name === 'AbortError') {
        const abortedError = new OperationAbortedError('syncWith', { reason: 'Signal received' });
        if (typeof onStatus === 'function') { onStatus({ type: 'failed', attempt, error: abortedError }); }
        throw abortedError;
      }
      if (err instanceof RetryExhaustedError) {
        const { cause } = err;
        if (typeof onStatus === 'function') { onStatus({ type: 'failed', attempt: err.attempts, error: cause }); }
        throw cause;
      }
      if (typeof onStatus === 'function') { onStatus({ type: 'failed', attempt, error: err as Error }); }
      throw err;
    }
  }

  /**
   * Performs one sync HTTP exchange via the SyncHttpClientPort.
   *
   * Serialization, signing, network I/O, and response decoding all
   * live inside the adapter — this method just converts the port's
   * typed result back into the controller's throw-based idiom (used
   * by the retry loop to decide whether to back off).
   */
  private async _fetchSyncResponse(
    request: SyncRequest, targetUrl: URL, timeoutMs: number,
    signal: AbortSignal | undefined,
    auth: { secret: string; keyId?: string } | undefined,
    emit: (type: string, payload?: SyncStatusPayload) => void,
  ): Promise<SyncResponse> {
    const httpClient = await this._resolveHttpClient();
    const result = await httpClient.exchange(
      {
        targetUrl, body: request, timeoutMs,
        headers: { 'content-type': 'application/json', 'accept': 'application/json' },
        ...(signal !== undefined ? { signal } : {}),
        ...(resolveAuth(auth, this._host._crypto, this._host._maxObservedLamport) !== undefined
          ? { auth: resolveAuth(auth, this._host._crypto, this._host._maxObservedLamport)! }
          : {}),
      },
      {
        onRequestSent: () => emit('requestSent'),
        onResponseReceived: (status) => emit('responseReceived', { status }),
      },
    );
    return interpretHttpResult(result, timeoutMs);
  }

  /** Starts a built-in sync server for this graph. */
  async serve(options: ServeOptions): Promise<ServerHandle> {
    return await launchSyncServer(this._host, options);
  }
}
