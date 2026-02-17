/**
 * Sync methods for WarpGraph — frontier, status, sync protocol, and HTTP serve.
 *
 * Every function uses `this` bound to a WarpGraph instance at runtime
 * via wireWarpMethods().
 *
 * @module domain/warp/sync.methods
 */

import {
  SyncError,
  OperationAbortedError,
  QueryError,
  E_NO_STATE_MSG,
  DEFAULT_SYNC_SERVER_MAX_BYTES,
  DEFAULT_SYNC_WITH_RETRIES,
  DEFAULT_SYNC_WITH_BASE_DELAY_MS,
  DEFAULT_SYNC_WITH_MAX_DELAY_MS,
  DEFAULT_SYNC_WITH_TIMEOUT_MS,
} from './_internal.js';
import {
  createSyncRequest as createSyncRequestImpl,
  processSyncRequest as processSyncRequestImpl,
  applySyncResponse as applySyncResponseImpl,
  syncNeeded as syncNeededImpl,
} from '../services/SyncProtocol.js';
import { retry, timeout, RetryExhaustedError, TimeoutError } from '@git-stunts/alfred';
import { checkAborted } from '../utils/cancellation.js';
import { createFrontier, updateFrontier } from '../services/Frontier.js';
import { buildWriterRef } from '../utils/RefLayout.js';
import { collectGCMetrics } from '../services/GCMetrics.js';
import HttpSyncServer from '../services/HttpSyncServer.js';
import { signSyncRequest, canonicalizePath } from '../services/SyncAuthService.js';

// ── Private helpers ─────────────────────────────────────────────────────────

/**
 * Normalizes a sync endpoint path to ensure it starts with '/'.
 * Returns '/sync' if no path is provided.
 *
 * @param {string|undefined|null} path - The sync path to normalize
 * @returns {string} Normalized path starting with '/'
 * @private
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
 * @private
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

// ── Exported methods ────────────────────────────────────────────────────────

/**
 * Returns the current frontier — a Map of writerId → tip SHA.
 *
 * @this {import('../WarpGraph.js').default}
 * @returns {Promise<Map<string, string>>} Frontier map
 * @throws {Error} If listing refs fails
 */
export async function getFrontier() {
  const writerIds = await this.discoverWriters();
  const frontier = createFrontier();

  for (const writerId of writerIds) {
    const writerRef = buildWriterRef(this._graphName, writerId);
    const tipSha = await this._persistence.readRef(writerRef);
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
 * @this {import('../WarpGraph.js').default}
 * @returns {Promise<boolean>} True if frontier has changed (or never materialized)
 * @throws {Error} If listing refs fails
 */
export async function hasFrontierChanged() {
  if (this._lastFrontier === null) {
    return true;
  }

  const current = await this.getFrontier();

  if (current.size !== this._lastFrontier.size) {
    return true;
  }

  for (const [writerId, tipSha] of current) {
    if (this._lastFrontier.get(writerId) !== tipSha) {
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
 * @this {import('../WarpGraph.js').default}
 * @returns {Promise<{
 *   cachedState: 'fresh' | 'stale' | 'none',
 *   patchesSinceCheckpoint: number,
 *   tombstoneRatio: number,
 *   writers: number,
 *   frontier: Record<string, string>,
 * }>} The graph status
 * @throws {Error} If listing refs fails
 */
export async function status() {
  // Fetch frontier once, reuse for both staleness check and return value
  const frontier = await this.getFrontier();

  // Determine cachedState
  /** @type {'fresh' | 'stale' | 'none'} */
  let cachedState;
  if (this._cachedState === null) {
    cachedState = 'none';
  } else if (this._stateDirty || !this._lastFrontier ||
    frontier.size !== this._lastFrontier.size ||
    ![...frontier].every(([w, sha]) => /** @type {Map<string, string>} */ (this._lastFrontier).get(w) === sha)) {
    cachedState = 'stale';
  } else {
    cachedState = 'fresh';
  }

  // patchesSinceCheckpoint
  const patchesSinceCheckpoint = this._patchesSinceCheckpoint;

  // tombstoneRatio
  let tombstoneRatio = 0;
  if (this._cachedState) {
    const metrics = collectGCMetrics(this._cachedState);
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
 * @this {import('../WarpGraph.js').default}
 * @returns {Promise<import('../services/SyncProtocol.js').SyncRequest>} The sync request
 * @throws {Error} If listing refs fails
 *
 * @example
 * const request = await graph.createSyncRequest();
 * // Send request to remote peer...
 */
export async function createSyncRequest() {
  const frontier = await this.getFrontier();
  return createSyncRequestImpl(frontier);
}

/**
 * Processes an incoming sync request and returns patches the requester needs.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {import('../services/SyncProtocol.js').SyncRequest} request - The incoming sync request
 * @returns {Promise<import('../services/SyncProtocol.js').SyncResponse>} The sync response
 * @throws {Error} If listing refs or reading patches fails
 *
 * @example
 * // Receive request from remote peer
 * const response = await graph.processSyncRequest(request);
 * // Send response back to requester...
 */
export async function processSyncRequest(request) {
  const localFrontier = await this.getFrontier();
  return await processSyncRequestImpl(
    request,
    localFrontier,
    /** @type {any} */ (this._persistence), // TODO(ts-cleanup): narrow port type
    this._graphName,
    { codec: this._codec }
  );
}

/**
 * Applies a sync response to the local graph state.
 * Updates the cached state with received patches.
 *
 * **Requires a cached state.**
 *
 * @this {import('../WarpGraph.js').default}
 * @param {import('../services/SyncProtocol.js').SyncResponse} response - The sync response
 * @returns {{state: import('../services/JoinReducer.js').WarpStateV5, applied: number}} Result with updated state
 * @throws {import('../errors/QueryError.js').default} If no cached state exists (code: `E_NO_STATE`)
 *
 * @example
 * await graph.materialize(); // Cache state first
 * const result = graph.applySyncResponse(response);
 * console.log(`Applied ${result.applied} patches from remote`);
 */
export function applySyncResponse(response) {
  if (!this._cachedState) {
    throw new QueryError(E_NO_STATE_MSG, {
      code: 'E_NO_STATE',
    });
  }

  const currentFrontier = /** @type {any} */ (this._cachedState.observedFrontier); // TODO(ts-cleanup): narrow port type
  const result = /** @type {{state: import('../services/JoinReducer.js').WarpStateV5, frontier: Map<string, string>, applied: number}} */ (applySyncResponseImpl(response, this._cachedState, currentFrontier));

  // Update cached state
  this._cachedState = result.state;

  // Keep _lastFrontier in sync so hasFrontierChanged() won't misreport stale.
  // Merge the response's per-writer tips into the stored frontier snapshot.
  if (this._lastFrontier && Array.isArray(response.patches)) {
    for (const { writerId, sha } of response.patches) {
      if (writerId && sha) {
        this._lastFrontier.set(writerId, sha);
      }
    }
  }

  // Track patches for GC
  this._patchesSinceGC += result.applied;

  // State is now in sync with the frontier — clear dirty flag
  this._stateDirty = false;

  return result;
}

/**
 * Checks if sync is needed with a remote frontier.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {Map<string, string>} remoteFrontier - The remote peer's frontier
 * @returns {Promise<boolean>} True if sync would transfer any patches
 * @throws {Error} If listing refs fails
 */
export async function syncNeeded(remoteFrontier) {
  const localFrontier = await this.getFrontier();
  return syncNeededImpl(localFrontier, remoteFrontier);
}

/**
 * Syncs with a remote peer (HTTP or direct graph instance).
 *
 * @this {import('../WarpGraph.js').default}
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
 * @returns {Promise<{applied: number, attempts: number, state?: import('../services/JoinReducer.js').WarpStateV5}>}
 */
export async function syncWith(remote, options = {}) {
  const t0 = this._clock.now();
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
  const emit = (/** @type {string} */ type, /** @type {Record<string, any>} */ payload = {}) => {
    if (typeof onStatus === 'function') {
      onStatus(/** @type {any} */ ({ type, attempt, ...payload })); // TODO(ts-cleanup): type sync protocol
    }
  };
  const shouldRetry = (/** @type {any} */ err) => { // TODO(ts-cleanup): type error
    if (isDirectPeer) { return false; }
    if (err instanceof SyncError) {
      return ['E_SYNC_REMOTE', 'E_SYNC_TIMEOUT', 'E_SYNC_NETWORK'].includes(err.code);
    }
    return err instanceof TimeoutError;
  };
  const executeAttempt = async () => {
    checkAborted(signal, 'syncWith');
    attempt += 1;
    const attemptStart = this._clock.now();
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
        auth, bodyStr, targetUrl: /** @type {URL} */ (targetUrl), crypto: this._crypto,
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
        if (/** @type {any} */ (err)?.name === 'AbortError') { // TODO(ts-cleanup): type error
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
          context: { message: /** @type {any} */ (err)?.message }, // TODO(ts-cleanup): type error
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

    if (!this._cachedState) {
      await this.materialize();
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

    const durationMs = this._clock.now() - attemptStart;
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
          onStatus(/** @type {any} */ ({ type: 'retrying', attempt: attemptNumber, delayMs, error })); // TODO(ts-cleanup): type sync protocol
        }
      },
    });

    this._logTiming('syncWith', t0, { metrics: `${syncResult.applied} patches applied` });

    if (materializeAfterSync) {
      if (!this._cachedState) { await this.materialize(); }
      return { ...syncResult, state: /** @type {import('../services/JoinReducer.js').WarpStateV5} */ (this._cachedState) };
    }
    return syncResult;
  } catch (err) {
    this._logTiming('syncWith', t0, { error: /** @type {Error} */ (err) });
    if (/** @type {any} */ (err)?.name === 'AbortError') { // TODO(ts-cleanup): type error
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
 * @this {import('../WarpGraph.js').default}
 * @param {Object} options
 * @param {number} options.port - Port to listen on
 * @param {string} [options.host='127.0.0.1'] - Host to bind
 * @param {string} [options.path='/sync'] - Path to handle sync requests
 * @param {number} [options.maxRequestBytes=4194304] - Max request size in bytes
 * @param {import('../../ports/HttpServerPort.js').default} options.httpPort - HTTP server adapter (required)
 * @param {{ keys: Record<string, string>, mode?: 'enforce'|'log-only' }} [options.auth] - Auth configuration
 * @returns {Promise<{close: () => Promise<void>, url: string}>} Server handle
 * @throws {Error} If port is not a number
 * @throws {Error} If httpPort adapter is not provided
 */
export async function serve({ port, host = '127.0.0.1', path = '/sync', maxRequestBytes = DEFAULT_SYNC_SERVER_MAX_BYTES, httpPort, auth } = /** @type {any} */ ({})) { // TODO(ts-cleanup): needs options type
  if (typeof port !== 'number') {
    throw new Error('serve() requires a numeric port');
  }
  if (!httpPort) {
    throw new Error('serve() requires an httpPort adapter');
  }

  const authConfig = auth
    ? { ...auth, crypto: this._crypto, logger: this._logger || undefined }
    : undefined;

  const httpServer = new HttpSyncServer({
    httpPort,
    graph: this,
    path,
    host,
    maxRequestBytes,
    auth: authConfig,
  });

  return await httpServer.listen(port);
}
