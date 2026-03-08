import WebSocketServerPort from '../../ports/WebSocketServerPort.js';
import { normalizeHost, assertNotListening, messageToString } from './wsAdapterUtils.js';

/**
 * Wraps a Bun ServerWebSocket into a port-compliant WsConnection.
 *
 * Handler refs are stored on `ws.data` so the Bun `websocket` callbacks
 * can route messages/closes to the correct connection.
 *
 * @param {BunServerWebSocket<BunWsData>} ws
 * @returns {import('../../ports/WebSocketServerPort.js').WsConnection}
 */
function wrapBunWs(ws) {
  return {
    send(message) {
      if (ws.readyState === 1) {
        ws.send(message);
      }
    },
    onMessage(handler) {
      // Flush any messages that arrived before the handler was set
      if (ws.data.messageBuffer.length > 0) {
        for (const buffered of ws.data.messageBuffer) {
          handler(buffered);
        }
        ws.data.messageBuffer.length = 0;
      }
      ws.data.messageHandler = handler;
    },
    onClose(handler) { ws.data.closeHandler = handler; },
    close() { ws.close(); },
  };
}

/**
 * Builds a Bun.serve fetch handler that attempts WS upgrade, then
 * optionally serves static files.
 *
 * @param {string|null} staticDir
 * @returns {(req: Request, srv: BunServer) => Promise<Response|undefined>}
 */
function createFetchHandler(staticDir) {
  return async (req, srv) => {
    if (srv.upgrade(req, { data: { messageHandler: null, closeHandler: null, messageBuffer: [] } })) {
      return undefined;
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
 * Bun WebSocket adapter implementing WebSocketServerPort.
 *
 * Uses `globalThis.Bun.serve()` with the `websocket` handler option.
 * When `staticDir` is provided, serves static files for non-WS requests.
 * This file can be imported on any runtime but will fail at call-time
 * if Bun is not available.
 *
 * @extends WebSocketServerPort
 */
export default class BunWsAdapter extends WebSocketServerPort {
  /**
   * @param {{ staticDir?: string|null }} [options]
   */
  constructor({ staticDir } = {}) {
    super();
    /** @type {string|null} */
    this._staticDir = staticDir || null;
  }

  /**
   * @param {(connection: import('../../ports/WebSocketServerPort.js').WsConnection) => void} onConnection
   * @returns {import('../../ports/WebSocketServerPort.js').WsServerHandle}
   */
  createServer(onConnection) {
    /** @type {BunServer|null} */
    let server = null;

    return {
      listen: (/** @type {number} */ port, /** @type {string} [host] */ host = '127.0.0.1') => {
        assertNotListening(server);
        const bindHost = normalizeHost(host);
        server = globalThis.Bun.serve({
          port,
          hostname: bindHost,
          fetch: createFetchHandler(this._staticDir),
          websocket: {
            open(ws) { onConnection(wrapBunWs(ws)); },
            message(ws, msg) {
              const text = messageToString(msg);
              if (ws.data.messageHandler) {
                ws.data.messageHandler(text);
              } else {
                ws.data.messageBuffer.push(text);
              }
            },
            close(ws, code, reason) {
              if (ws.data.closeHandler) {
                ws.data.closeHandler(code, reason);
              }
            },
          },
        });
        return Promise.resolve({ port: server.port, host: bindHost });
      },

      close() {
        if (!server) {
          return Promise.resolve();
        }
        const s = server;
        server = null;
        try {
          return Promise.resolve(s.stop()).catch(() => {
            // Best-effort — stop() may reject on some versions
          });
        } catch {
          // Best-effort — stop() may throw synchronously
          return Promise.resolve();
        }
      },
    };
  }
}
