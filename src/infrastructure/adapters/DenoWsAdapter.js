import WebSocketServerPort from '../../ports/WebSocketServerPort.js';
import { normalizeHost, assertNotListening, messageToString } from './wsAdapterUtils.js';

/**
 * Wraps a Deno WebSocket (standard browser-like API) into a
 * port-compliant WsConnection.
 *
 * Handler refs are set by `onMessage()`/`onClose()` before any
 * messages can arrive, because `onConnection` runs synchronously
 * inside `socket.onopen`.
 *
 * @param {WebSocket} socket
 * @returns {import('../../ports/WebSocketServerPort.js').WsConnection}
 */
function wrapDenoWs(socket) {
  /** @type {((message: string) => void)|null} */
  let messageHandler = null;
  /** @type {((code?: number, reason?: string) => void)|null} */
  let closeHandler = null;
  /** @type {string[]} */
  const messageBuffer = [];

  socket.onmessage = (e) => {
    const text = messageToString(e.data);
    if (messageHandler) {
      messageHandler(text);
    } else {
      messageBuffer.push(text);
    }
  };

  socket.onclose = (e) => {
    if (closeHandler) {
      closeHandler(e.code, e.reason);
    }
  };

  return {
    send(message) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(message);
      }
    },
    onMessage(handler) {
      // Flush any messages that arrived before the handler was set
      for (const buffered of messageBuffer) {
        handler(buffered);
      }
      messageBuffer.length = 0;
      messageHandler = handler;
    },
    onClose(handler) { closeHandler = handler; },
    close() { socket.close(); },
  };
}

/**
 * Builds the Deno.serve request handler that upgrades WS connections
 * and optionally serves static files.
 *
 * @param {(connection: import('../../ports/WebSocketServerPort.js').WsConnection) => void} onConnection
 * @param {string|null} staticDir
 * @returns {(req: Request) => Response|Promise<Response>}
 */
function createDenoHandler(onConnection, staticDir) {
  return async (req) => {
    const upgrade = req.headers.get('upgrade');
    if (upgrade && upgrade.toLowerCase() === 'websocket') {
      const { socket, response } = globalThis.Deno.upgradeWebSocket(req);
      socket.onopen = () => { onConnection(wrapDenoWs(socket)); };
      return response;
    }
    if (staticDir) {
      const { handleStaticRequest } = await import('./staticFileHandler.js');
      const url = new URL(req.url);
      const result = await handleStaticRequest(staticDir, url.pathname);
      return new Response(/** @type {BodyInit|null} */ (result.body), { status: result.status, headers: result.headers });
    }
    return new Response('Not Found', { status: 404 });
  };
}

/**
 * Deno WebSocket adapter implementing WebSocketServerPort.
 *
 * Uses `globalThis.Deno.serve()` with `Deno.upgradeWebSocket()` to
 * handle incoming WebSocket connections. When `staticDir` is provided,
 * serves static files for non-WS requests.
 * This file can be imported on any runtime but will fail at call-time
 * if Deno is not available.
 *
 * @extends WebSocketServerPort
 */
export default class DenoWsAdapter extends WebSocketServerPort {
  /**
   * @param {{ staticDir?: string|null }} [options]
   */
  constructor(options = undefined) {
    const { staticDir } = options || {};
    super();
    /** @type {string|null} */
    this._staticDir = staticDir || null;
  }

  /**
   * @param {(connection: import('../../ports/WebSocketServerPort.js').WsConnection) => void} onConnection
   * @returns {import('../../ports/WebSocketServerPort.js').WsServerHandle}
   */
  createServer(onConnection) {
    /** @type {DenoServer|null} */
    let server = null;
    const handler = createDenoHandler(onConnection, this._staticDir);

    return {
      listen(/** @type {number} */ port, /** @type {string} [host] */ host = '127.0.0.1') {
        assertNotListening(server);
        const bindHost = normalizeHost(host);
        return new Promise((resolve, reject) => {
          try {
            server = globalThis.Deno.serve(
              {
                port,
                hostname: bindHost,
                onListen() {
                  resolve({ port: /** @type {DenoServer} */ (server).addr.port, host: bindHost });
                },
              },
              handler,
            );
          } catch (err) {
            reject(err);
          }
        });
      },

      close() {
        if (!server) {
          return Promise.resolve();
        }
        const s = server;
        server = null;
        return s.shutdown();
      },
    };
  }
}
