/**
 * SyncController - Encapsulates all sync functionality for WarpGraph.
 *
 * Extracted from the original sync.methods.js free functions into a
 * service class. WarpGraph.prototype delegates directly to this controller
 * via defineProperty loops — no intermediate stub file.
 *
 * @module domain/services/SyncController
 */

import SyncError from '../errors/SyncError.js';
import OperationAbortedError from '../errors/OperationAbortedError.js';
import QueryError from '../errors/QueryError.js';
import {
  createSyncRequest as createSyncRequestImpl,
  processSyncRequest as processSyncRequestImpl,
  applySyncResponse as applySyncResponseImpl,
  syncNeeded as syncNeededImpl,
} from './SyncProtocol.js';
import { retry, timeout, RetryExhaustedError, TimeoutError } from '@git-stunts/alfred';
import { checkAborted } from '../utils/cancellation.js';
import { createFrontier, updateFrontier } from './Frontier.js';
import { buildWriterRef } from '../utils/RefLayout.js';
import { collectGCMetrics } from './GCMetrics.js';
import HttpSyncServer from './HttpSyncServer.js';
import { signSyncRequest, canonicalizePath } from './SyncAuthService.js';
import { isError } from '../types/WarpErrors.js';

/** @typedef {import('../types/WarpPersistence.js').CorePersistence} CorePersistence */

/**
 * The host interface that SyncController depends on.
 *
 * Documents the exact WarpGraph surface the controller accesses,
 * making the coupling explicit and enabling lightweight mock hosts
 * in unit tests.
 *
 * @typedef {Object} SyncHost
 * @property {import('../services/JoinReducer.js').WarpStateV5|null} _cachedState
 * @property {Map<string, string>|null} _lastFrontier
 * @property {boolean} _stateDirty
 * @property {number} _patchesSinceGC
 * @property {string} _graphName
 * @property {CorePersistence} _persistence
 * @property {import('../../ports/ClockPort.js').default} _clock
 * @property {import('../../ports/CodecPort.js').default} _codec
 * @property {import('../../ports/CryptoPort.js').default} _crypto
 * @property {import('../../ports/LoggerPort.js').default|null} _logger
 * @property {number} _patchesSinceCheckpoint
 * @property {(op: string, t0: number, opts?: {metrics?: string, error?: Error}) => void} _logTiming
 * @property {(options?: Record<string, unknown>) => Promise<unknown>} materialize
 * @property {() => Promise<string[]>} discoverWriters
 */

// ── Constants ───────────────────────────────────────────────────────────────

const E_NO_STATE_MSG = 'No materialized state. Call materialize() before querying, or use autoMaterialize: true (the default). See https://github.com/git-stunts/git-warp#materialization';
const DEFAULT_SYNC_SERVER_MAX_BYTES = 4 * 1024 * 1024;
const DEFAULT_SYNC_WITH_RETRIES = 3;
const DEFAULT_SYNC_WITH_BASE_DELAY_MS = 250;
const DEFAULT_SYNC_WITH_MAX_DELAY_MS = 2000;
const DEFAULT_SYNC_WITH_TIMEOUT_MS = 10_000;

// ── Private helpers ─────────────────────────────────────────────────────────

/**
 * Normalizes a sync endpoint path to ensure it starts with '/'.
 * Returns '/sync' if no path is provided.
 *
 * @param {string|undefined|null} path - The sync path to normalize
 * @returns {string} Normalized path starting with '/'
 */
function normalizeSyncPath(path) {
  if (!path) {
    return '/sync';
  }
  return path.startsWith('/') ? path : `/${path}`;
}

/**
 * Builds auth headers for an outgoing sync request if auth is configured.
 *
 * @param {Object} params
 * @param {{ secret: string, keyId?: string }|undefined} params.auth
 * @param {string} params.bodyStr - Serialized request body
 * @param {URL} params.targetUrl
 * @param {import('../../ports/CryptoPort.js').default} params.crypto
 * @returns {Promise<Record<string, string>>}
 */
async function buildSyncAuthHeaders({ auth, bodyStr, targetUrl, crypto }) {
  if (!auth || !auth.secret) {
    return {};
  }
  const bodyBuf = new TextEncoder().encode(bodyStr);
  return await signSyncRequest(
    {
      method: 'POST',
      path: canonicalizePath(targetUrl.pathname + (targetUrl.search || '')),
      contentType: 'application/json',
      body: bodyBuf,
      secret: auth.secret,
      keyId: auth.keyId || 'default',
    },
    { crypto },
  );
}

// ── SyncController ──────────────────────────────────────────────────────────

/**
 * Encapsulates all sync-related operations for a WarpGraph instance.
 */
export default class SyncController {
  /**
   * @param {SyncHost} host - The WarpGraph instance (or any object satisfying SyncHost)
   */
  constructor(host) {
    /** @type {SyncHost} */
    this._host = host;
  }

  /**
   * Returns the current frontier -- a Map of writerId -> tip SHA.
   *
   * @returns {Promise<Map<string, string>>} Frontier map
   * @throws {Error} If listing refs fails
   */
  async getFrontier() {
    const writerIds = await this._host.discoverWriters();
    const frontier = createFrontier();

    for (const writerId of writerIds) {
      const writerRef = buildWriterRef(this._host._graphName, writerId);
      const tipSha = await this._host._persistence.readRef(writerRef);
      if (tipSha) {
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
   * @returns {Promise<boolean>} True if frontier has changed (or never materialized)
   * @throws {Error} If listing refs fails
   */
  async hasFrontierChanged() {
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
   * @returns {Promise<{
   *   cachedState: 'fresh' | 'stale' | 'none',
   *   patchesSinceCheckpoint: number,
   *   tombstoneRatio: number,
   *   writers: number,
   *   frontier: Record<string, string>,
   * }>} The graph status
   * @throws {Error} If listing refs fails
   */
  async status() {
    // Fetch frontier once, reuse for both staleness check and return value
    const frontier = await this.getFrontier();

    // Determine cachedState
    /** @type {'fresh' | 'stale' | 'none'} */
    let cachedState;
    if (this._host._cachedState === null) {
      cachedState = 'none';
    } else if (this._host._stateDirty || !this._host._lastFrontier ||
      frontier.size !== this._host._lastFrontier.size ||
      ![...frontier].every(([w, sha]) => /** @type {Map<string, string>} */ (this._host._lastFrontier).get(w) === sha)) {
      cachedState = 'stale';
    } else {
      cachedState = 'fresh';
    }

    // patchesSinceCheckpoint
    const patchesSinceCheckpoint = this._host._patchesSinceCheckpoint;

    // tombstoneRatio
    let tombstoneRatio = 0;
    if (this._host._cachedState) {
      const metrics = collectGCMetrics(this._host._cachedState);
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
   * @returns {Promise<import('./SyncProtocol.js').SyncRequest>} The sync request
   * @throws {Error} If listing refs fails
   */
  async createSyncRequest() {
    const frontier = await this.getFrontier();
    return createSyncRequestImpl(frontier);
  }

  /**
   * Processes an incoming sync request and returns patches the requester needs.
   *
   * @param {import('./SyncProtocol.js').SyncRequest} request - The incoming sync request
   * @returns {Promise<import('./SyncProtocol.js').SyncResponse>} The sync response
   * @throws {Error} If listing refs or reading patches fails
   */
  async processSyncRequest(request) {
    const localFrontier = await this.getFrontier();
    /** @type {CorePersistence} */
    const persistence = this._host._persistence;
    return await processSyncRequestImpl(
      request,
      localFrontier,
      persistence,
      this._host._graphName,
      { codec: this._host._codec }
    );
  }

  /**
   * Applies a sync response to the local graph state.
   * Updates the cached state with received patches.
   *
   * **Requires a cached state.**
   *
   * @param {import('./SyncProtocol.js').SyncResponse} response - The sync response
   * @returns {{state: import('./JoinReducer.js').WarpStateV5, applied: number}} Result with updated state
   * @throws {import('../errors/QueryError.js').default} If no cached state exists (code: `E_NO_STATE`)
   */
  applySyncResponse(response) {
    if (!this._host._cachedState) {
      throw new QueryError(E_NO_STATE_MSG, {
        code: 'E_NO_STATE',
      });
    }

    const currentFrontier = this._host._lastFrontier || createFrontier();
    const result = /** @type {{state: import('./JoinReducer.js').WarpStateV5, frontier: Map<string, string>, applied: number}} */ (applySyncResponseImpl(response, this._host._cachedState, currentFrontier));

    // Update cached state
    this._host._cachedState = result.state;

    // Keep _lastFrontier in sync so hasFrontierChanged() won't misreport stale.
    this._host._lastFrontier = result.frontier;

    // Track patches for GC
    this._host._patchesSinceGC += result.applied;

    // State is now in sync with the frontier -- clear dirty flag
    this._host._stateDirty = false;

    return result;
  }

  /**
   * Checks if sync is needed with a remote frontier.
   *
   * @param {Map<string, string>} remoteFrontier - The remote peer's frontier
   * @returns {Promise<boolean>} True if sync would transfer any patches
   * @throws {Error} If listing refs fails
   */
  async syncNeeded(remoteFrontier) {
    const localFrontier = await this.getFrontier();
    return syncNeededImpl(localFrontier, remoteFrontier);
  }

  /**
   * Syncs with a remote peer (HTTP or direct graph instance).
   *
   * @param {string|import('../WarpGraph.js').default} remote - URL or peer graph instance
   * @param {Object} [options]
   * @param {string} [options.path='/sync'] - Sync path (HTTP mode)
   * @param {number} [options.retries=3] - Retry count
   * @param {number} [options.baseDelayMs=250] - Base backoff delay
   * @param {number} [options.maxDelayMs=2000] - Max backoff delay
   * @param {number} [options.timeoutMs=10000] - Request timeout
   * @param {AbortSignal} [options.signal] - Abort signal
   * @param {(event: {type: string, attempt: number, durationMs?: number, status?: number, error?: Error}) => void} [options.onStatus]
   * @param {boolean} [options.materialize=false] - Auto-materialize after sync
   * @param {{ secret: string, keyId?: string }} [options.auth] - Client auth credentials
   * @returns {Promise<{applied: number, attempts: number, state?: import('./JoinReducer.js').WarpStateV5}>}
   */
  async syncWith(remote, options = {}) {
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
    } = options;

    const hasPathOverride = Object.prototype.hasOwnProperty.call(options, 'path');
    const isDirectPeer = remote && typeof remote === 'object' &&
      typeof remote.processSyncRequest === 'function';
    let targetUrl = null;
    if (!isDirectPeer) {
      try {
        targetUrl = remote instanceof URL ? new URL(remote.toString()) : new URL(/** @type {string} */ (remote));
      } catch {
        throw new SyncError('Invalid remote URL', {
          code: 'E_SYNC_REMOTE_URL',
          context: { remote },
        });
      }

      if (!['http:', 'https:'].includes(targetUrl.protocol)) {
        throw new SyncError('Unsupported remote URL protocol', {
          code: 'E_SYNC_REMOTE_URL',
          context: { protocol: targetUrl.protocol },
        });
      }

      const normalizedPath = normalizeSyncPath(path);
      if (!targetUrl.pathname || targetUrl.pathname === '/') {
        targetUrl.pathname = normalizedPath;
      } else if (hasPathOverride) {
        targetUrl.pathname = normalizedPath;
      }
      targetUrl.hash = '';
    }
    let attempt = 0;
    const emit = (/** @type {string} */ type, /** @type {Record<string, unknown>} */ payload = {}) => {
      if (typeof onStatus === 'function') {
        onStatus(/** @type {{type: string, attempt: number}} */ ({ type, attempt, ...payload }));
      }
    };
    const shouldRetry = (/** @type {unknown} */ err) => {
      if (isDirectPeer) { return false; }
      if (err instanceof SyncError) {
        return ['E_SYNC_REMOTE', 'E_SYNC_TIMEOUT', 'E_SYNC_NETWORK'].includes(err.code);
      }
      return err instanceof TimeoutError;
    };
    const executeAttempt = async () => {
      checkAborted(signal, 'syncWith');
      attempt += 1;
      const attemptStart = this._host._clock.now();
      emit('connecting');
      const request = await this.createSyncRequest();
      emit('requestBuilt');
      let response;
      if (isDirectPeer) {
        emit('requestSent');
        response = await remote.processSyncRequest(request);
        emit('responseReceived');
      } else {
        emit('requestSent');
        const bodyStr = JSON.stringify(request);
        const authHeaders = await buildSyncAuthHeaders({
          auth, bodyStr, targetUrl: /** @type {URL} */ (targetUrl), crypto: this._host._crypto,
        });
        let res;
        try {
          res = await timeout(timeoutMs, (timeoutSignal) => {
            const combinedSignal = signal
              ? AbortSignal.any([timeoutSignal, signal])
              : timeoutSignal;
            return fetch(/** @type {URL} */ (targetUrl).toString(), {
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
          response = await res.json();
        } catch {
          throw new SyncError('Invalid JSON response', {
            code: 'E_SYNC_PROTOCOL',
            context: { status: res.status },
          });
        }
      }

      if (!this._host._cachedState) {
        await this._host.materialize();
        emit('materialized');
      }

      if (!response || typeof response !== 'object' ||
        response.type !== 'sync-response' ||
        !response.frontier || typeof response.frontier !== 'object' || Array.isArray(response.frontier) ||
        !Array.isArray(response.patches)) {
        throw new SyncError('Invalid sync response', {
          code: 'E_SYNC_PROTOCOL',
        });
      }

      const result = this.applySyncResponse(response);
      emit('applied', { applied: result.applied });

      const durationMs = this._host._clock.now() - attemptStart;
      emit('complete', { durationMs, applied: result.applied });
      return { applied: result.applied, attempts: attempt };
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
        onRetry: (/** @type {Error} */ error, /** @type {number} */ attemptNumber, /** @type {number} */ delayMs) => {
          if (typeof onStatus === 'function') {
            onStatus(/** @type {{type: string, attempt: number, delayMs: number, error: Error}} */ ({ type: 'retrying', attempt: attemptNumber, delayMs, error }));
          }
        },
      });

      this._host._logTiming('syncWith', t0, { metrics: `${syncResult.applied} patches applied` });

      if (materializeAfterSync) {
        if (!this._host._cachedState) { await this._host.materialize(); }
        return { ...syncResult, state: /** @type {import('./JoinReducer.js').WarpStateV5} */ (this._host._cachedState) };
      }
      return syncResult;
    } catch (err) {
      this._host._logTiming('syncWith', t0, { error: /** @type {Error} */ (err) });
      if (isError(err) && err.name === 'AbortError') {
        const abortedError = new OperationAbortedError('syncWith', { reason: 'Signal received' });
        if (typeof onStatus === 'function') {
          onStatus({ type: 'failed', attempt, error: abortedError });
        }
        throw abortedError;
      }
      if (err instanceof RetryExhaustedError) {
        const cause = /** @type {Error} */ (err.cause || err);
        if (typeof onStatus === 'function') {
          onStatus({ type: 'failed', attempt: err.attempts, error: cause });
        }
        throw cause;
      }
      if (typeof onStatus === 'function') {
        onStatus({ type: 'failed', attempt, error: /** @type {Error} */ (err) });
      }
      throw err;
    }
  }

  /**
   * Starts a built-in sync server for this graph.
   *
   * @param {Object} options
   * @param {number} options.port - Port to listen on
   * @param {string} [options.host='127.0.0.1'] - Host to bind
   * @param {string} [options.path='/sync'] - Path to handle sync requests
   * @param {number} [options.maxRequestBytes=4194304] - Max request size in bytes
   * @param {import('../../ports/HttpServerPort.js').default} options.httpPort - HTTP server adapter
   * @param {{ keys: Record<string, string>, mode?: 'enforce'|'log-only' }} [options.auth] - Auth configuration
   * @returns {Promise<{close: () => Promise<void>, url: string}>} Server handle
   * @throws {Error} If port is not a number
   * @throws {Error} If httpPort adapter is not provided
   */
  async serve({ port, host = '127.0.0.1', path = '/sync', maxRequestBytes = DEFAULT_SYNC_SERVER_MAX_BYTES, httpPort, auth } = /** @type {{ port: number, httpPort: import('../../ports/HttpServerPort.js').default }} */ ({})) {
    if (typeof port !== 'number') {
      throw new Error('serve() requires a numeric port');
    }
    if (!httpPort) {
      throw new Error('serve() requires an httpPort adapter');
    }

    const authConfig = auth
      ? { ...auth, crypto: this._host._crypto, logger: this._host._logger || undefined }
      : undefined;

    const httpServer = new HttpSyncServer({
      httpPort,
      graph: /** @type {{ processSyncRequest: Function }} */ (/** @type {unknown} */ (this._host)),
      path,
      host,
      maxRequestBytes,
      auth: authConfig,
    });

    return await httpServer.listen(port);
  }
}
