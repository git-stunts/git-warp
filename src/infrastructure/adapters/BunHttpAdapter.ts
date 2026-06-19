import HttpServerPort, { type HttpRequest, HttpResponse, type HttpServerHandle } from '../../ports/HttpServerPort.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import {
  noopLogger,
  toPortRequest,
  ERROR_BODY,
  ERROR_BODY_LENGTH,
  PAYLOAD_TOO_LARGE_BODY,
  PAYLOAD_TOO_LARGE_LENGTH,
} from './httpAdapterUtils.ts';

/**
 * Converts a plain-object port response into a Bun Response.
 */
function toResponse(portResponse: HttpResponse): Response {
  const validated = HttpResponse.from(portResponse);
  return new Response((validated.body ?? null) as BodyInit | null, {
    status: validated.status ?? 200,
    headers: validated.headers ?? {},
  });
}

/**
 * Creates the Bun fetch handler that bridges between Request/Response
 * and the HttpServerPort plain-object contract.
 */
function createFetchHandler(
  requestHandler: (request: HttpRequest) => Promise<HttpResponse>,
  logger: { error(...args: unknown[]): void },
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const portReq = await toPortRequest(request);
      const portRes = await requestHandler(portReq);
      return toResponse(portRes);
    } catch (err) {
      if (typeof err === 'object' && err !== null && (err as { status?: number }).status === 413) {
        return new Response(PAYLOAD_TOO_LARGE_BODY, {
          status: 413,
          headers: { 'Content-Type': 'text/plain', 'Content-Length': PAYLOAD_TOO_LARGE_LENGTH },
        });
      }
      logger.error('BunHttpAdapter dispatch error', err);
      return new Response(ERROR_BODY, {
        status: 500,
        headers: {
          'Content-Type': 'text/plain',
          'Content-Length': ERROR_BODY_LENGTH,
        },
      });
    }
  };
}

/**
 * Coerces an unknown caught value into an Error instance for callback propagation.
 */
function wrapError(err: unknown): Error {
  if (err instanceof Error) {
    return err;
  }
  return new WarpError(String(err), 'E_BUN_HTTP');
}

/**
 * Starts a Bun server and invokes the callback with (null) on success
 * or (err) on failure.
 */
function startServer(
  serveOptions: BunServeOptions,
  cb: ((err: Error | null) => void) | undefined,
): BunServer {
  const server = globalThis.Bun.serve(serveOptions);
  if (cb) {
    cb(null);
  }
  return server;
}

/**
 * Safely stops a Bun server, forwarding errors to the callback.
 */
function stopServer(
  state: { server: BunServer | null },
  callback?: (err?: Error) => void,
): void {
  try {
    stopServerInner(state);
    if (callback) {
      callback();
    }
  } catch (err: unknown) {
    if (callback) {
      callback(wrapError(err));
    }
  }
}

/**
 * Stops the Bun server and clears the state reference.
 */
function stopServerInner(state: { server: BunServer | null }): void {
  if (state.server) {
    void state.server.stop();
    state.server = null;
  }
}

/**
 * Resolves the listen callback and hostname from overloaded arguments.
 */
function resolveListenArgs(
  host?: string | ((err?: Error | null) => void),
  callback?: (err?: Error | null) => void,
): { cb: ((err?: Error | null) => void) | undefined; bindHost: string | undefined } {
  const cb = typeof host === 'function' ? host : callback;
  const bindHost = typeof host === 'string' ? host : undefined;
  return { cb, bindHost };
}

/**
 * Creates a BunServeOptions object from the given parameters.
 */
function buildServeOptions(
  port: number,
  fetchHandler: (request: Request) => Promise<Response>,
  bindHost: string | undefined,
): BunServeOptions {
  const serveOptions: BunServeOptions = { port, fetch: fetchHandler };
  if (bindHost !== undefined) {
    serveOptions.hostname = bindHost;
  }
  return serveOptions;
}

interface BunListenContext {
  state: { server: BunServer | null };
  fetchHandler: (request: Request) => Promise<Response>;
}

interface BunListenArgs {
  port: number;
  host?: string | ((err?: Error | null) => void);
  callback?: (err?: Error | null) => void;
}

/**
 * Handles the listen call by resolving args, building options, starting the server.
 */
function bunListenImpl(ctx: BunListenContext, args: BunListenArgs): void {
  const { cb, bindHost } = resolveListenArgs(args.host, args.callback);
  const serveOptions = buildServeOptions(args.port, ctx.fetchHandler, bindHost);
  try {
    ctx.state.server = startServer(serveOptions, cb);
  } catch (err: unknown) {
    if (cb) {
      cb(wrapError(err));
    }
  }
}

/**
 * Returns the server's bound address info for a Bun server.
 */
function bunAddressImpl(
  state: { server: BunServer | null },
): { address: string; port: number; family: string } | null {
  if (!state.server) {
    return null;
  }
  return {
    address: state.server.hostname,
    port: state.server.port,
    family: state.server.hostname.includes(':') ? 'IPv6' : 'IPv4',
  };
}

/**
 * Bun HTTP adapter implementing HttpServerPort.
 *
 * Uses `globalThis.Bun.serve()` so the module can be imported on any
 * runtime (it will throw at call-time if Bun is not available).
 */
export default class BunHttpAdapter extends HttpServerPort {
  private readonly _logger: { error(...args: unknown[]): void };

  constructor(options?: { logger?: { error(...args: unknown[]): void } }) {
    const { logger } = options ?? {};
    super();
    this._logger = logger ?? noopLogger;
  }

  createServer(requestHandler: (request: HttpRequest) => Promise<HttpResponse>): HttpServerHandle {
    const fetchHandler = createFetchHandler(requestHandler, this._logger);
    const state: { server: BunServer | null } = { server: null };

    return {
      listen: (port, host, callback) => bunListenImpl({ state, fetchHandler }, {
        port,
        ...(host !== undefined ? { host } : {}),
        ...(callback !== undefined ? { callback } : {}),
      }),
      close: (callback) => stopServer(state, callback),
      address: () => bunAddressImpl(state),
    };
  }
}
