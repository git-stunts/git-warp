/**
 * Sync method stubs for WarpGraph — thin delegation to SyncController.
 *
 * Every function uses `this` bound to a WarpGraph instance at runtime
 * via wireWarpMethods(). Each stub forwards to `this._syncController`.
 *
 * @module domain/warp/sync.methods
 */

// ── Exported methods (delegation) ───────────────────────────────────────────

/**
 * Returns the current frontier -- a Map of writerId -> tip SHA.
 *
 * @this {import('../WarpGraph.js').default}
 * @returns {Promise<Map<string, string>>} Frontier map
 * @throws {Error} If listing refs fails
 */
export async function getFrontier() {
  return await this._syncController.getFrontier();
}

/**
 * Checks whether any writer tip has changed since the last materialize.
 *
 * @this {import('../WarpGraph.js').default}
 * @returns {Promise<boolean>} True if frontier has changed (or never materialized)
 * @throws {Error} If listing refs fails
 */
export async function hasFrontierChanged() {
  return await this._syncController.hasFrontierChanged();
}

/**
 * Returns a lightweight status snapshot of the graph's operational state.
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
  return await this._syncController.status();
}

/**
 * Creates a sync request to send to a remote peer.
 *
 * @this {import('../WarpGraph.js').default}
 * @returns {Promise<import('../services/SyncProtocol.js').SyncRequest>} The sync request
 * @throws {Error} If listing refs fails
 */
export async function createSyncRequest() {
  return await this._syncController.createSyncRequest();
}

/**
 * Processes an incoming sync request and returns patches the requester needs.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {import('../services/SyncProtocol.js').SyncRequest} request - The incoming sync request
 * @returns {Promise<import('../services/SyncProtocol.js').SyncResponse>} The sync response
 * @throws {Error} If listing refs or reading patches fails
 */
export async function processSyncRequest(request) {
  return await this._syncController.processSyncRequest(request);
}

/**
 * Applies a sync response to the local graph state.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {import('../services/SyncProtocol.js').SyncResponse} response - The sync response
 * @returns {{state: import('../services/JoinReducer.js').WarpStateV5, applied: number}} Result
 * @throws {import('../errors/QueryError.js').default} If no cached state exists
 */
export function applySyncResponse(response) {
  return this._syncController.applySyncResponse(response);
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
  return await this._syncController.syncNeeded(remoteFrontier);
}

/**
 * Syncs with a remote peer (HTTP or direct graph instance).
 *
 * @this {import('../WarpGraph.js').default}
 * @param {string|import('../WarpGraph.js').default} remote - URL or peer graph instance
 * @param {Object} [options] - Sync options
 * @returns {Promise<{applied: number, attempts: number, state?: import('../services/JoinReducer.js').WarpStateV5}>}
 */
export async function syncWith(remote, options = {}) {
  return await this._syncController.syncWith(remote, options);
}

/**
 * Starts a built-in sync server for this graph.
 *
 * @this {import('../WarpGraph.js').default}
 * @param {Object} [options] - Server options
 * @returns {Promise<{close: () => Promise<void>, url: string}>} Server handle
 */
export async function serve(options) {
  return await this._syncController.serve(options);
}
