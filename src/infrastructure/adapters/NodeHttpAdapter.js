import HttpServerPort from '../../ports/HttpServerPort.js';
import { createServer } from 'node:http';

/** Absolute streaming body limit (10 MB). */
const MAX_BODY_BYTES = 10 * 1024 * 1024;

/**
 * Collects the request body and dispatches to the handler, returning
 * a 500 response if the handler throws.
 */
async function dispatch(req, res, { handler, logger }) {
  try {
    const chunks = [];
    let totalBytes = 0;
    for await (const chunk of req) {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY_BYTES) {
        res.writeHead(413, { 'Content-Type': 'text/plain' });
        res.end('Payload Too Large');
        req.destroy();
        return;
      }
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);

    const response = await handler({
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: body.length > 0 ? body : undefined,
    });

    res.writeHead(response.status || 200, response.headers || {});
    res.end(response.body);
  } catch (err) {
    logger.error('[NodeHttpAdapter] dispatch error:', err);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
    }
    res.end('Internal Server Error');
  }
}

const noopLogger = { error() {} };

/**
 * Node.js HTTP adapter implementing HttpServerPort.
 *
 * This is the only file that imports node:http for server creation.
 *
 * @extends HttpServerPort
 */
export default class NodeHttpAdapter extends HttpServerPort {
  /**
   * @param {{ logger?: { error: Function } }} [options]
   */
  constructor({ logger } = {}) {
    super();
    this._logger = logger || noopLogger;
  }

  /** @inheritdoc */
  createServer(requestHandler) {
    const logger = this._logger;
    const server = createServer((req, res) => dispatch(req, res, { handler: requestHandler, logger }));

    return {
      listen(port, host, callback) {
        const cb = typeof host === 'function' ? host : callback;
        const bindHost = typeof host === 'string' ? host : undefined;
        const onError = (err) => {
          if (cb) {
            cb(err);
          }
        };
        server.once('error', onError);
        const args = bindHost !== undefined ? [port, bindHost] : [port];
        server.listen(...args, () => {
          server.removeListener('error', onError);
          if (cb) {
            cb(null);
          }
        });
      },
      close(callback) {
        server.close(callback);
      },
      address() {
        return server.address();
      },
    };
  }
}
