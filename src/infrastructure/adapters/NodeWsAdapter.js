import { createServer as createHttpServer } from 'node:http';
import { WebSocketServer } from 'ws';
import WebSocketServerPort from '../../ports/WebSocketServerPort.js';
import { normalizeHost, assertNotListening, messageToString } from './wsAdapterUtils.js';

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

  ws.on('message', (/** @type {import('ws').RawData} */ data) => {
    if (messageHandler) {
      messageHandler(messageToString(data));
    }
  });

  ws.on('close', (/** @type {number} */ code, /** @type {Buffer} */ reason) => {
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
 * @param {((err: Error) => void)|undefined} [onError]
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void}
 */
function createStaticHandler(staticDir, onError) {
  /** @type {typeof import('./staticFileHandler.js').handleStaticRequest|null} */
  let handler = null;
  return (req, res) => {
    const urlPath = new URL(req.url || '/', 'http://localhost').pathname;
    (handler
      ? Promise.resolve(handler)
      : import('./staticFileHandler.js').then(m => { handler = m.handleStaticRequest; return handler; })
    ).then((h) => h(staticDir, urlPath)).then((result) => {
      res.writeHead(result.status, result.headers);
      res.end(result.body);
    }).catch((/** @type {Error} */ err) => {
      if (onError) { onError(err); }
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
 * @property {((err: Error) => void)|undefined} [onError]
 */

/**
 * Starts listening with an HTTP server underneath for static file serving.
 *
 * @param {string} staticDir
 * @param {ListenOptions} opts
 * @returns {Promise<{ port: number, host: string }>}
 */
function listenWithHttp(staticDir, opts) {
  const { onConnection, port, bindHost, state, onError } = opts;
  return new Promise((resolve, reject) => {
    state.httpServer = createHttpServer(createStaticHandler(staticDir, onError));
    state.wss = new WebSocketServer({ server: state.httpServer });
    state.wss.on('connection', (/** @type {import('ws').WebSocket} */ ws) => onConnection(wrapConnection(ws)));
    const onStartupError = (/** @type {Error} */ err) => {
      state.wss = null;
      state.httpServer = null;
      reject(err);
    };
    state.httpServer.on('error', onStartupError);
    state.httpServer.listen(port, bindHost, () => {
      // Remove startup error listener — the promise is resolved.
      state.httpServer?.removeListener('error', onStartupError);
      state.httpServer?.on('error', (/** @type {Error} */ err) => { if (onError) { onError(err); } });
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
  const { onConnection, port, bindHost, state, onError } = opts;
  return new Promise((resolve, reject) => {
    state.wss = new WebSocketServer({ port, host: bindHost });
    const onStartupError = (/** @type {Error} */ err) => {
      state.wss = null;
      state.httpServer = null;
      reject(err);
    };
    state.wss.on('listening', () => {
      // Remove startup error listener — the promise is resolved.
      state.wss?.removeListener('error', onStartupError);
      state.wss?.on('error', (/** @type {Error} */ err) => { if (onError) { onError(err); } });
      const addr = state.wss?.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({ port: actualPort, host: bindHost });
    });
    state.wss.on('error', onStartupError);
    state.wss.on('connection', (/** @type {import('ws').WebSocket} */ ws) => onConnection(wrapConnection(ws)));
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
   * @param {{ staticDir?: string|null, onError?: (err: Error) => void }} [options]
   */
  constructor({ staticDir, onError } = {}) {
    super();
    /** @type {string|null} */
    this._staticDir = staticDir || null;
    /** @type {((err: Error) => void)|undefined} */
    this._onError = onError;
  }

  /**
   * @param {(connection: import('../../ports/WebSocketServerPort.js').WsConnection) => void} onConnection
   * @returns {import('../../ports/WebSocketServerPort.js').WsServerHandle}
   */
  createServer(onConnection) {
    /** @type {{ wss: WebSocketServer|null, httpServer: import('node:http').Server|null }} */
    const state = { wss: null, httpServer: null };
    const staticDir = this._staticDir;
    const onError = this._onError;

    return {
      listen(/** @type {number} */ port, /** @type {string} [host] */ host = '127.0.0.1') {
        assertNotListening(state.wss);
        const bindHost = normalizeHost(host);
        const opts = { onConnection, port, bindHost, state, onError };
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
          const httpSrv = state.httpServer;
          state.wss.close((/** @type {Error|undefined} */ wssErr) => {
            state.wss = null;
            state.httpServer = null;
            if (httpSrv) {
              httpSrv.close((httpErr) => {
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
