import HttpServerPort, { HttpRequest, HttpResponse, type HttpServerHandle } from '../../ports/HttpServerPort.ts';
import { MAX_BODY_BYTES, noopLogger } from './httpAdapterUtils.ts';
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import WarpError from '../../domain/errors/WarpError.ts';

/**
 * Error thrown when the request body exceeds the size limit.
 */
class PayloadTooLargeError extends WarpError {
  constructor(totalBytes: number) {
    super('Payload Too Large', 'E_PAYLOAD_TOO_LARGE', { context: { totalBytes } });
  }
}

/**
 * Reads the request body from a Node.js IncomingMessage stream, enforcing a size limit.
 */
async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += (chunk as Buffer).length;
    if (totalBytes > MAX_BODY_BYTES) {
      req.destroy();
      throw new PayloadTooLargeError(totalBytes);
    }
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * Returns the string if non-empty, otherwise the fallback.
 */
function stringOrDefault(value: string | undefined, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/** Converts Node's incoming header shape into the port header contract. */
function normalizeNodeHeaders(headers: IncomingMessage['headers']): Record<string, string> {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string') {
      normalized[key] = value;
    } else if (Array.isArray(value)) {
      normalized[key] = value.join(', ');
    }
  }
  return normalized;
}

/**
 * Builds an HttpRequest from a Node.js IncomingMessage and body buffer.
 */
function buildHttpRequest(req: IncomingMessage, body: Buffer): HttpRequest {
  return new HttpRequest({
    method: stringOrDefault(req.method, 'GET'),
    url: stringOrDefault(req.url, '/'),
    headers: normalizeNodeHeaders(req.headers),
    body: body.length > 0 ? body : undefined,
  });
}

/**
 * Handles a dispatch error, sending the appropriate response.
 */
function handleDispatchError(
  err: unknown,
  res: ServerResponse,
  logger: { error(...args: unknown[]): void },
): void {
  if (err instanceof PayloadTooLargeError) {
    res.writeHead(413, { 'Content-Type': 'text/plain' });
    res.end('Payload Too Large');
    return;
  }
  logger.error('[NodeHttpAdapter] dispatch error:', err);
  if (!res.headersSent) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
  }
  res.end('Internal Server Error');
}

/**
 * Sends the handler response back through the Node.js ServerResponse.
 */
function sendResponse(response: HttpResponse, res: ServerResponse): void {
  const validated = HttpResponse.from(response);
  res.writeHead(validated.status ?? 200, validated.headers ?? {});
  res.end(validated.body ?? undefined);
}

interface DispatchOptions {
  handler: (request: HttpRequest) => Promise<HttpResponse>;
  logger: { error(...args: unknown[]): void };
}

/**
 * Collects the request body and dispatches to the handler, returning
 * a 500 response if the handler throws.
 */
async function dispatch(
  req: IncomingMessage,
  res: ServerResponse,
  { handler, logger }: DispatchOptions,
): Promise<void> {
  try {
    const body = await readBody(req);
    const request = buildHttpRequest(req, body);
    const response = await handler(request);
    sendResponse(response, res);
  } catch (err) {
    handleDispatchError(err, res, logger);
  }
}

/**
 * Node.js HTTP adapter implementing HttpServerPort.
 *
 * This is the only file that imports node:http for server creation.
 */
export default class NodeHttpAdapter extends HttpServerPort {
  private readonly _logger: { error(...args: unknown[]): void };

  constructor(options?: { logger?: { error(...args: unknown[]): void } }) {
    super();
    const { logger } = options ?? {};
    this._logger = logger ?? noopLogger;
  }

  createServer(requestHandler: (request: HttpRequest) => Promise<HttpResponse>): HttpServerHandle {
    const server = buildNodeServer(requestHandler, this._logger);
    return createServerHandle(server);
  }
}

/**
 * Creates a Node.js HTTP server that dispatches requests through the handler.
 */
function buildNodeServer(
  requestHandler: (request: HttpRequest) => Promise<HttpResponse>,
  logger: { error(...args: unknown[]): void },
): Server {
  return createServer((req, res) => {
    dispatch(req, res, { handler: requestHandler, logger }).catch((err: unknown) => {
      logger.error('[NodeHttpAdapter] unhandled dispatch error:', err);
    });
  });
}

/**
 * Wraps a Node.js HTTP server in the HttpServerHandle interface.
 */
function createServerHandle(server: Server): HttpServerHandle {
  return {
    listen(port, host, callback) {
      const cb = typeof host === 'function' ? host : callback;
      const bindHost = typeof host === 'string' ? host : undefined;
      startListening({ server, port, bindHost, cb });
    },
    close(callback) {
      server.close(callback);
    },
    address() {
      return server.address() as { address: string; port: number; family: string } | null;
    },
  };
}

interface StartListeningOpts {
  server: Server;
  port: number;
  bindHost: string | undefined;
  cb: ((err?: Error | null) => void) | undefined;
}

/**
 * Starts listening on the server, branching on whether a host is specified.
 */
function startListening({ server, port, bindHost, cb }: StartListeningOpts): void {
  const onError = (err: unknown) => {
    if (cb) {
      cb(err instanceof Error ? err : new WarpError(String(err), 'E_HTTP_LISTEN'));
    }
  };

  const onListening = () => {
    server.removeListener('error', onError);
    if (cb) {
      cb(null);
    }
  };

  server.once('error', onError);
  if (bindHost !== undefined) {
    server.listen(port, bindHost, onListening);
  } else {
    server.listen(port, onListening);
  }
}
