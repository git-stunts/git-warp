/**
 * WarpSocket — browser WebSocket client for the git-warp serve protocol.
 *
 * Framework-agnostic: uses only globalThis.WebSocket.
 * Handles the v1 protocol envelope, request-response correlation,
 * and push message dispatch.
 *
 * @module net/WarpSocket
 */

const PROTOCOL_VERSION = 1;

/**
 * @typedef {{ protocol: number, graphs: string[] }} HelloPayload
 * @typedef {{ graph: string, nodes: Array<{ id: string, props: Record<string, unknown> }>, edges: Array<{ from: string, to: string, label: string }>, frontier: Record<string, number> }} StatePayload
 * @typedef {{ graph: string, diff: { nodes: { added: string[], removed: string[] }, edges: { added: unknown[], removed: unknown[] }, props: { set: unknown[], removed: unknown[] } } }} DiffPayload
 * @typedef {{ sha?: string }} AckPayload
 * @typedef {{ graph: string, nodeId: string, props: Record<string, unknown>|null }} InspectPayload
 * @typedef {{ code: string, message: string }} ErrorPayload
 */

/** Default request timeout in milliseconds (30 seconds). */
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;

export default class WarpSocket {
  /**
   * @param {string} url - WebSocket server URL (e.g. ws://localhost:3000)
   * @param {{ WebSocket?: any, requestTimeoutMs?: number }} [options] - Dependency injection for testing
   */
  constructor(url, options = {}) {
    /** @type {string} */
    this._url = url;

    /** @type {any} */
    this._WS = options.WebSocket || globalThis.WebSocket;

    /** @type {number} */
    this._requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

    /** @type {WebSocket|null} */
    this._ws = null;

    /** @type {number} */
    this._nextId = 1;

    /** @type {Map<string, { resolve: Function, reject: Function }>} */
    this._pending = new Map();

    /** @type {Array<(payload: DiffPayload) => void>} */
    this._diffListeners = [];

    /** @type {Array<() => void>} */
    this._disconnectListeners = [];

    /** @type {Array<(payload: ErrorPayload) => void>} */
    this._errorListeners = [];
  }

  /**
   * Connect to the server and wait for the hello message.
   *
   * @returns {Promise<HelloPayload>}
   */
  connect() {
    return new Promise((resolve, reject) => {
      const ws = new this._WS(this._url);
      this._ws = ws;

      let helloReceived = false;

      ws.onopen = () => {
        // Wait for hello message — don't resolve yet
      };

      ws.onerror = () => {
        if (!helloReceived) {
          reject(new Error(`WebSocket connection failed: ${this._url}`));
        }
      };

      ws.onclose = (/** @type {{ code: number, reason: string }} */ event) => {
        if (!helloReceived) {
          reject(new Error(`WebSocket closed before hello: code=${event.code}`));
          return;
        }
        this._onClose();
      };

      ws.onmessage = (/** @type {{ data: string }} */ event) => {
        const msg = this._parse(event.data);
        if (!msg) { return; }

        if (!helloReceived) {
          if (msg.type === 'hello') {
            helloReceived = true;
            // Now wire up the permanent message handler
            ws.onmessage = (/** @type {{ data: string }} */ e) => this._onMessage(e.data);
            ws.onclose = () => this._onClose();
            resolve(/** @type {HelloPayload} */ (msg.payload));
          }
          return;
        }
      };
    });
  }

  /**
   * Subscribe to a graph and receive its current state.
   *
   * @param {{ graph: string, writerId?: string }} payload
   * @returns {Promise<StatePayload>}
   */
  open(payload) {
    return this._request('open', payload, 'state');
  }

  /**
   * Send mutations to a graph.
   *
   * @param {{ graph: string, ops: Array<{ op: string, args: unknown[] }> }} payload
   * @returns {Promise<AckPayload>}
   */
  mutate(payload) {
    return this._request('mutate', payload, 'ack');
  }

  /**
   * Inspect a node's properties.
   *
   * @param {{ graph: string, nodeId: string }} payload
   * @returns {Promise<InspectPayload>}
   */
  inspect(payload) {
    return this._request('inspect', payload, 'inspect');
  }

  /**
   * Time-travel to a specific ceiling tick.
   *
   * @param {{ graph: string, ceiling: number }} payload
   * @returns {Promise<StatePayload>}
   */
  seek(payload) {
    return this._request('seek', payload, 'state');
  }

  /**
   * Register a callback for incoming diff push messages.
   *
   * @param {(payload: DiffPayload) => void} handler
   */
  onDiff(handler) {
    this._diffListeners.push(handler);
  }

  /**
   * Register a callback for disconnection.
   *
   * @param {() => void} handler
   */
  onDisconnect(handler) {
    this._disconnectListeners.push(handler);
  }

  /**
   * Register a callback for server error push messages.
   *
   * @param {(payload: ErrorPayload) => void} handler
   */
  onError(handler) {
    this._errorListeners.push(handler);
  }

  /**
   * Close the WebSocket connection.
   */
  close() {
    if (this._ws) {
      this._ws.close();
      this._ws = null;
    }
  }

  // ── Internal ────────────────────────────────────────────────────────

  /**
   * Send a request and wait for the correlated response.
   *
   * @param {string} type
   * @param {unknown} payload
   * @param {string} expectedResponseType
   * @returns {Promise<any>}
   * @private
   */
  _request(type, payload, expectedResponseType) {
    const id = `req-${this._nextId++}`;
    const msg = JSON.stringify({ v: PROTOCOL_VERSION, type, id, payload });

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this._pending.has(id)) {
          this._pending.delete(id);
          reject(new Error(`Request ${type} timed out after ${this._requestTimeoutMs}ms`));
        }
      }, this._requestTimeoutMs);

      this._pending.set(id, {
        resolve: (value) => { clearTimeout(timer); resolve(value); },
        reject: (err) => { clearTimeout(timer); reject(err); },
      });

      if (this._ws) {
        this._ws.send(msg);
      } else {
        clearTimeout(timer);
        reject(new Error('Not connected'));
        this._pending.delete(id);
      }
    });
  }

  /**
   * Handle an incoming message after the hello handshake.
   *
   * @param {string} data
   * @private
   */
  _onMessage(data) {
    const msg = this._parse(data);
    if (!msg) { return; }

    // Correlated response — resolve/reject pending request
    if (msg.id && this._pending.has(msg.id)) {
      const { resolve, reject } = /** @type {{ resolve: Function, reject: Function }} */ (this._pending.get(msg.id));
      this._pending.delete(msg.id);

      if (msg.type === 'error') {
        const err = /** @type {ErrorPayload} */ (msg.payload);
        reject(new Error(err.message || err.code));
      } else {
        resolve(msg.payload);
      }
      return;
    }

    // Push messages (no correlation id, or unmatched id)
    switch (msg.type) {
      case 'diff':
        for (const listener of this._diffListeners) {
          listener(/** @type {DiffPayload} */ (msg.payload));
        }
        break;
      case 'error':
        for (const listener of this._errorListeners) {
          listener(/** @type {ErrorPayload} */ (msg.payload));
        }
        break;
      default:
        // Unknown push type — ignore
        break;
    }
  }

  /**
   * Handle WebSocket close — reject pending requests and notify listeners.
   *
   * @private
   */
  _onClose() {
    const error = new Error('WebSocket disconnected');
    for (const [, { reject }] of this._pending) {
      reject(error);
    }
    this._pending.clear();

    for (const listener of this._disconnectListeners) {
      listener();
    }
  }

  /**
   * Parse a JSON message, returning null on failure.
   *
   * @param {string} data
   * @returns {{ v: number, type: string, id?: string, payload: unknown }|null}
   * @private
   */
  _parse(data) {
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }
}
