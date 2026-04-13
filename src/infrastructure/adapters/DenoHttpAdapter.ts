import HttpServerPort from '../../ports/HttpServerPort.ts';
import type { HttpRequest, HttpResponse, HttpServerHandle } from '../../ports/HttpServerPort.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import {
  noopLogger,
  toPortRequest,
  ERROR_BODY_BYTES,
  PAYLOAD_TOO_LARGE_BYTES,
  PAYLOAD_TOO_LARGE_LENGTH,
} from './httpAdapterUtils.ts';

/**
 * Converts a plain-object response from the handler into a Deno Response.
 */
function toDenoResponse(plain: HttpResponse): Response {
  const status = plain.status !== undefined && plain.status !== 0 ? plain.status : 200;
  return new Response((plain.body ?? null) as BodyInit | null, {
    status,
    headers: plain.headers ?? {},
  });
}

/**
 * Creates a Deno.serve-compatible handler that bridges to the
 * HttpServerPort request handler contract.
 */
function createHandler(
  requestHandler: (request: HttpRequest) => Promise<HttpResponse>,
  logger: { error(...args: unknown[]): void },
): (request: Request) => Promise<Response> {
  return async (request) => {
    try {
      const portReq = await toPortRequest(request);
      const response = await requestHandler(portReq);
      return toDenoResponse(response);
    } catch (err) {
      if (typeof err === 'object' && err !== null && (err as { status?: number }).status === 413) {
        return new Response(PAYLOAD_TOO_LARGE_BYTES, {
          status: 413,
          headers: { 'Content-Type': 'text/plain', 'Content-Length': PAYLOAD_TOO_LARGE_LENGTH },
        });
      }
      logger.error('DenoHttpAdapter dispatch error', err);
      return new Response(ERROR_BODY_BYTES, {
        status: 500,
        headers: {
          'Content-Type': 'text/plain',
          'Content-Length': String(ERROR_BODY_BYTES.byteLength),
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
  return new WarpError(String(err), 'E_DENO_HTTP');
}

interface DenoServerState {
  server: DenoServer | null;
}

/**
 * Gracefully shuts down the Deno HTTP server.
 */
function closeImpl(state: DenoServerState, callback?: (err?: Error) => void): void {
  if (!state.server) {
    if (callback) {
      callback();
    }
    return;
  }
  state.server.shutdown().then(
    () => {
      state.server = null;
      if (callback) {
        callback();
      }
    },
    (err: unknown) => {
      state.server = null;
      if (callback) {
        callback(wrapError(err));
      }
    },
  );
}

/**
 * Returns the server's bound address info.
 */
function addressImpl(state: DenoServerState): { address: string; port: number; family: string } | null {
  if (!state.server) {
    return null;
  }
  const { addr } = state.server;
  if (addr.transport !== 'tcp' && addr.transport !== 'udp') {
    return null;
  }
  return {
    address: addr.hostname,
    port: addr.port,
    family: addr.hostname.includes(':') ? 'IPv6' : 'IPv4',
  };
}

/**
 * Resolves the listen callback and hostname from overloaded arguments.
 */
function resolveListenArgs(
  host?: string | ((err?: Error | null) => void),
  callback?: (err?: Error | null) => void,
): { cb: ((err?: Error | null) => void) | undefined; hostname: string | undefined } {
  const cb = typeof host === 'function' ? host : callback;
  const hostname = typeof host === 'string' ? host : undefined;
  return { cb, hostname };
}

/**
 * Builds DenoServeOptions from port, hostname, and callback.
 */
function buildDenoServeOptions(
  port: number,
  hostname: string | undefined,
  cb: ((err?: Error | null) => void) | undefined,
): DenoServeOptions {
  const opts: DenoServeOptions = {
    port,
    onListen() {
      if (cb) {
        cb(null);
      }
    },
  };
  if (hostname !== undefined) {
    opts.hostname = hostname;
  }
  return opts;
}

interface DenoListenContext {
  state: DenoServerState;
  handler: (request: Request) => Promise<Response>;
}

interface DenoListenArgs {
  port: number;
  host?: string | ((err?: Error | null) => void);
  callback?: (err?: Error | null) => void;
}

/**
 * Handles the listen call by resolving args, starting the server, and handling errors.
 */
function listenImpl(ctx: DenoListenContext, args: DenoListenArgs): void {
  const { cb, hostname } = resolveListenArgs(args.host, args.callback);
  try {
    const opts = buildDenoServeOptions(args.port, hostname, cb);
    ctx.state.server = globalThis.Deno!.serve(opts, ctx.handler);
  } catch (err: unknown) {
    if (cb) {
      cb(wrapError(err));
    } else {
      throw wrapError(err);
    }
  }
}

/**
 * Deno runtime HTTP adapter implementing HttpServerPort.
 *
 * Uses globalThis.Deno.serve() (Deno 1.35+) to create an HTTP server.
 * This file can be imported on any runtime but will fail at runtime
 * if Deno APIs are not available.
 */
export default class DenoHttpAdapter extends HttpServerPort {
  private readonly _logger: { error(...args: unknown[]): void };

  constructor(options?: { logger?: { error(...args: unknown[]): void } }) {
    const { logger } = options ?? {};
    super();
    this._logger = logger ?? noopLogger;
  }

  createServer(requestHandler: (request: HttpRequest) => Promise<HttpResponse>): HttpServerHandle {
    const handler = createHandler(requestHandler, this._logger);
    const state: DenoServerState = { server: null };

    return {
      listen: (port, host, callback) => listenImpl({ state, handler }, {
        port,
        ...(host !== undefined ? { host } : {}),
        ...(callback !== undefined ? { callback } : {}),
      }),
      close: (callback) => closeImpl(state, callback),
      address: () => addressImpl(state),
    };
  }
}
