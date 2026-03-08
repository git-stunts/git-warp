import { createServer as createHttpServer } from 'node:http';
import { WebSocketServer } from 'ws';
import WebSocketServerPort from '../../ports/WebSocketServerPort.js';
import { handleStaticRequest } from './staticFileHandler.js';

/**
 * Wraps a raw `ws` WebSocket into a port-compliant WsConnection.
 *
 * @param {import('ws').WebSocket} ws
 * @returns {import('../../ports/WebSocketServerPort.js').WsConnection}
 */
function wrapConnection(ws) {
  /** @type {((message: string) => void)|null} */
  let messageHandler = null;
  /** @type {((code?: number, reason?: string) => void)|null} */
  let closeHandler = null;

  ws.on('message', (data) => {
    if (messageHandler) {
      messageHandler(String(data));
    }
  });

  ws.on('close', (code, reason) => {
    if (closeHandler) {
      closeHandler(code, reason?.toString());
    }
  });

  return {
    send(message) {
      if (ws.readyState === ws.OPEN) {
        ws.send(message);
      }
    },
    onMessage(handler) { messageHandler = handler; },
    onClose(handler) { closeHandler = handler; },
    close() { ws.close(); },
  };
}

/**
 * Creates an HTTP request handler that serves static files.
 *
 * @param {string} staticDir
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void}
 */
function createStaticHandler(staticDir) {
  return (req, res) => {
    const urlPath = new URL(req.url || '/', 'http://localhost').pathname;
    handleStaticRequest(staticDir, urlPath).then((result) => {
      res.writeHead(result.status, result.headers);
      res.end(result.body);
    }).catch(() => {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('Internal Server Error');
    });
  };
}

/**
 * @typedef {Object} ListenOptions
 * @property {(conn: import('../../ports/WebSocketServerPort.js').WsConnection) => void} onConnection
 * @property {number} port
 * @property {string} bindHost
 * @property {{ wss: WebSocketServer|null, httpServer: import('node:http').Server|null }} state
 */

/**
 * Starts listening with an HTTP server underneath for static file serving.
 *
 * @param {string} staticDir
 * @param {ListenOptions} opts
 * @returns {Promise<{ port: number, host: string }>}
 */
function listenWithHttp(staticDir, opts) {
  const { onConnection, port, bindHost, state } = opts;
  return new Promise((resolve, reject) => {
    state.httpServer = createHttpServer(createStaticHandler(staticDir));
    state.wss = new WebSocketServer({ server: state.httpServer });
    state.wss.on('connection', (ws) => onConnection(wrapConnection(ws)));
    state.httpServer.on('error', reject);
    state.httpServer.listen(port, bindHost, () => {
      const addr = state.httpServer?.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({ port: actualPort, host: bindHost });
    });
  });
}

/**
 * Starts listening with a standalone WebSocket server (no HTTP).
 *
 * @param {ListenOptions} opts
 * @returns {Promise<{ port: number, host: string }>}
 */
function listenWsOnly(opts) {
  const { onConnection, port, bindHost, state } = opts;
  return new Promise((resolve, reject) => {
    state.wss = new WebSocketServer({ port, host: bindHost });
    state.wss.on('listening', () => {
      const addr = state.wss?.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({ port: actualPort, host: bindHost });
    });
    state.wss.on('error', reject);
    state.wss.on('connection', (ws) => onConnection(wrapConnection(ws)));
  });
}

/**
 * Node.js WebSocket adapter implementing WebSocketServerPort.
 *
 * Uses the `ws` npm package for WebSocket server functionality.
 * This is the only file that imports `ws` directly.
 *
 * When `staticDir` is provided, creates an HTTP server that serves
 * static files and mounts the WebSocket server on top of it.
 *
 * @extends WebSocketServerPort
 */
export default class NodeWsAdapter extends WebSocketServerPort {
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
    /** @type {{ wss: WebSocketServer|null, httpServer: import('node:http').Server|null }} */
    const state = { wss: null, httpServer: null };
    const staticDir = this._staticDir;

    return {
      listen(/** @type {number} */ port, /** @type {string} [host] */ host) {
        const bindHost = host || '127.0.0.1';
        const opts = { onConnection, port, bindHost, state };
        if (staticDir) {
          return listenWithHttp(staticDir, opts);
        }
        return listenWsOnly(opts);
      },

      close() {
        return new Promise((resolve, reject) => {
          if (!state.wss) {
            resolve();
            return;
          }
          for (const client of state.wss.clients) {
            client.close();
          }
          state.wss.close((wssErr) => {
            if (state.httpServer) {
              state.httpServer.close((httpErr) => {
                const err = wssErr || httpErr;
                if (err) { reject(err); } else { resolve(); }
              });
            } else if (wssErr) {
              reject(wssErr);
            } else {
              resolve();
            }
          });
        });
      },
    };
  }
}
