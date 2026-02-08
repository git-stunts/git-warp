import HttpServerPort from '../../ports/HttpServerPort.js';
import { createServer } from 'node:http';

/**
 * Node.js HTTP adapter implementing HttpServerPort.
 *
 * This is the only file that imports node:http for server creation.
 *
 * @extends HttpServerPort
 */
export default class NodeHttpAdapter extends HttpServerPort {
  /** @inheritdoc */
  createServer(requestHandler) {
    const server = createServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);

      const response = await requestHandler({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: body.length > 0 ? body : undefined,
      });

      res.writeHead(response.status || 200, response.headers || {});
      res.end(response.body);
    });

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
