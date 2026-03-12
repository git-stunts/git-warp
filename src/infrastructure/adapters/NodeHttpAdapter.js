import HttpServerPort from '../../ports/HttpServerPort.js';
import { MAX_BODY_BYTES, noopLogger } from './httpAdapterUtils.js';
import { createServer } from 'node:http';

/**
 * Collects the request body and dispatches to the handler, returning
 * a 500 response if the handler throws.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {{ handler: (request: import('../../ports/HttpServerPort.js').HttpRequest) => Promise<import('../../ports/HttpServerPort.js').HttpResponse>, logger: { error: (...args: unknown[]) => void } }} options
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

    const response = await handler(/** @type {import('../../ports/HttpServerPort.js').HttpRequest} */ ({
      method: req.method || 'GET',
      url: req.url || '/',
      headers: /** @type {Record<string, string>} */ (req.headers),
      body: body.length > 0 ? body : undefined,
    }));

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

/**
 * Node.js HTTP adapter implementing HttpServerPort.
 *
 * This is the only file that imports node:http for server creation.
 *
 * @extends HttpServerPort
 */
export default class NodeHttpAdapter extends HttpServerPort {
  /**
   * @param {{ logger?: { error: (...args: unknown[]) => void } }} [options]
   */
  constructor(options = undefined) {
    super();
    const { logger } = options || {};
    this._logger = logger || noopLogger;
  }

  /**
   * @param {(request: import('../../ports/HttpServerPort.js').HttpRequest) => Promise<import('../../ports/HttpServerPort.js').HttpResponse>} requestHandler
   * @returns {import('../../ports/HttpServerPort.js').HttpServerHandle}
   */
  createServer(requestHandler) {
    const logger = this._logger;
    const server = createServer((req, res) => {
      dispatch(req, res, { handler: requestHandler, logger }).catch(
        /** @param {unknown} err */ (err) => {
          logger.error('[NodeHttpAdapter] unhandled dispatch error:', err);
        });
    });

    return {
      /**
       * @param {number} port
       * @param {string|((err?: Error | null) => void)} [host]
       * @param {(err?: Error | null) => void} [callback]
       */
      listen(port, host, callback) {
        const cb = typeof host === 'function' ? host : callback;
        const bindHost = typeof host === 'string' ? host : undefined;
        /** @param {unknown} err */
        const onError = (err) => {
          if (cb) {
            cb(err instanceof Error ? err : new Error(String(err)));
          }
        };
        server.once('error', onError);
        if (bindHost !== undefined) {
          server.listen(port, bindHost, () => {
            server.removeListener('error', onError);
            if (cb) {
              cb(null);
            }
          });
        } else {
          server.listen(port, () => {
            server.removeListener('error', onError);
            if (cb) {
              cb(null);
            }
          });
        }
      },
      /** @param {(err?: Error) => void} [callback] */
      close(callback) {
        server.close(callback);
      },
      address() {
        return /** @type {{ address: string, port: number, family: string } | null} */ (server.address());
      },
    };
  }
}
