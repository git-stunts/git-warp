import { createServer as createHttpServer } from 'node:http';
import { WebSocketServer } from 'ws';
import WebSocketServerPort from '../../ports/WebSocketServerPort.js';
import { normalizeHost, assertNotListening, messageToString } from './wsAdapterUtils.js';

const NOOP = () => undefined;

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
  /** @type {string[]} */
  const messageBuffer = [];

  ws.on('message', (/** @type {import('ws').RawData} */ data) => {
    const text = messageToString(data);
    if (messageHandler) {
      messageHandler(text);
    } else {
      messageBuffer.push(text);
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
    onMessage(handler) {
      // Flush any messages that arrived before the handler was set
      for (const buffered of messageBuffer) {
        handler(buffered);
      }
      messageBuffer.length = 0;
      messageHandler = handler;
    },
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
 * @property {{ wss: WebSocketServer|null, httpServer: import('node:http').Server|null, wssErrorHandler: ((err: Error) => void)|null, httpServerErrorHandler: ((err: Error) => void)|null }} state
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
    const httpServer = createHttpServer(createStaticHandler(staticDir, onError));
    const wss = new WebSocketServer({ server: httpServer });
    const onConnectionInternal = (/** @type {import('ws').WebSocket} */ ws) => onConnection(wrapConnection(ws));

    function cleanupStartupListeners() {
      httpServer.removeListener('error', onStartupError);
      wss.removeListener('error', onStartupError);
    }

    function onStartupError(/** @type {Error} */ err) {
      cleanupStartupListeners();
      wss.close();
      httpServer.close(NOOP);
      reject(err);
    }

    httpServer.on('error', onStartupError);
    wss.on('error', onStartupError);
    wss.on('connection', onConnectionInternal);
    httpServer.listen(port, bindHost, () => {
      cleanupStartupListeners();
      const httpRuntimeErrorHandler = (/** @type {Error} */ err) => { if (onError) { onError(err); } };
      const wssRuntimeErrorHandler = (/** @type {Error} */ err) => { if (onError) { onError(err); } };
      httpServer.on('error', httpRuntimeErrorHandler);
      wss.on('error', wssRuntimeErrorHandler);
      state.httpServer = httpServer;
      state.wss = wss;
      state.httpServerErrorHandler = httpRuntimeErrorHandler;
      state.wssErrorHandler = wssRuntimeErrorHandler;
      const addr = httpServer.address();
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
    const wss = new WebSocketServer({ port, host: bindHost });
    const onConnectionInternal = (/** @type {import('ws').WebSocket} */ ws) => onConnection(wrapConnection(ws));

    function cleanupStartupListeners() {
      wss.removeListener('error', onStartupError);
      wss.removeListener('listening', onListening);
    }

    function onStartupError(/** @type {Error} */ err) {
      cleanupStartupListeners();
      wss.close();
      reject(err);
    }

    function onListening() {
      cleanupStartupListeners();
      const wssRuntimeErrorHandler = (/** @type {Error} */ err) => { if (onError) { onError(err); } };
      wss.on('error', wssRuntimeErrorHandler);
      state.wss = wss;
      state.httpServer = null;
      state.wssErrorHandler = wssRuntimeErrorHandler;
      state.httpServerErrorHandler = null;
      const addr = wss.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      resolve({ port: actualPort, host: bindHost });
    }

    wss.on('listening', onListening);
    wss.on('error', onStartupError);
    wss.on('connection', onConnectionInternal);
  });
}

/**
 * Closes a server state and clears runtime listeners.
 *
 * @param {{ wss: WebSocketServer|null, httpServer: import('node:http').Server|null, wssErrorHandler: ((err: Error) => void)|null, httpServerErrorHandler: ((err: Error) => void)|null }} state
 * @returns {Promise<void>}
 */
function closeServerState(state) {
  return new Promise((resolve, reject) => {
    const {
      wss,
      httpServer: httpSrv,
      wssErrorHandler,
      httpServerErrorHandler,
    } = state;

    state.wss = null;
    state.httpServer = null;
    state.wssErrorHandler = null;
    state.httpServerErrorHandler = null;

    if (!wss && !httpSrv) {
      resolve();
      return;
    }

    if (wss && wssErrorHandler) {
      wss.removeListener('error', wssErrorHandler);
    }
    if (httpSrv && httpServerErrorHandler) {
      httpSrv.removeListener('error', httpServerErrorHandler);
    }

    const finishHttpClose = (/** @type {Error|undefined} */ wssErr) => {
      if (!httpSrv) {
        if (wssErr) { reject(wssErr); } else { resolve(); }
        return;
      }
      httpSrv.close((httpErr) => {
        const err = wssErr || httpErr || undefined;
        if (err) { reject(err); } else { resolve(); }
      });
    };

    if (!wss) {
      finishHttpClose(undefined);
      return;
    }

    for (const client of wss.clients) {
      client.close();
    }
    wss.close((/** @type {Error|undefined} */ wssErr) => {
      finishHttpClose(wssErr);
    });
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
  constructor(options = undefined) {
    const { staticDir, onError } = options || {};
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
    /** @type {{ wss: WebSocketServer|null, httpServer: import('node:http').Server|null, wssErrorHandler: ((err: Error) => void)|null, httpServerErrorHandler: ((err: Error) => void)|null }} */
    const state = { wss: null, httpServer: null, wssErrorHandler: null, httpServerErrorHandler: null };
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
        return closeServerState(state);
      },
    };
  }
}
