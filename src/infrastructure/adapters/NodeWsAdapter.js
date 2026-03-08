import { WebSocketServer } from 'ws';
import WebSocketServerPort from '../../ports/WebSocketServerPort.js';

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
 * Node.js WebSocket adapter implementing WebSocketServerPort.
 *
 * Uses the `ws` npm package for WebSocket server functionality.
 * This is the only file that imports `ws` directly.
 *
 * @extends WebSocketServerPort
 */
export default class NodeWsAdapter extends WebSocketServerPort {
  /**
   * @param {(connection: import('../../ports/WebSocketServerPort.js').WsConnection) => void} onConnection
   * @returns {import('../../ports/WebSocketServerPort.js').WsServerHandle}
   */
  createServer(onConnection) {
    /** @type {WebSocketServer|null} */
    let wss = null;

    return {
      listen(/** @type {number} */ port, /** @type {string} [host] */ host) {
        const bindHost = host || '127.0.0.1';
        return new Promise((resolve, reject) => {
          wss = new WebSocketServer({ port, host: bindHost });
          wss.on('listening', () => {
            const addr = wss?.address();
            const actualPort = typeof addr === 'object' && addr ? addr.port : port;
            resolve({ port: actualPort, host: bindHost });
          });
          wss.on('error', reject);
          wss.on('connection', (ws) => onConnection(wrapConnection(ws)));
        });
      },

      close() {
        return new Promise((resolve, reject) => {
          if (!wss) {
            resolve();
            return;
          }
          for (const client of wss.clients) {
            client.close();
          }
          wss.close((err) => {
            if (err) { reject(err); } else { resolve(); }
          });
        });
      },
    };
  }
}
