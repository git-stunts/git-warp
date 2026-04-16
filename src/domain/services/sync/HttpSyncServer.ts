/**
 * HTTP sync server extracted from WarpRuntime.serve().
 *
 * Handles request routing, JSON parsing, validation, and error responses
 * for the sync protocol. All HTTP I/O flows through an HttpServerPort
 * so the domain never touches node:http directly.
 *
 * @module domain/services/sync/HttpSyncServer
 */

import type SyncAuthService from './SyncAuthService.ts';
import SyncError from '../../errors/SyncError.ts';
import type { HttpRequest } from '../../../ports/HttpServerPort.ts';
import type { SyncRequest } from './SyncProtocol.ts';
import {
  parseOptions,
  errorResponse,
  jsonResponse,
  checkContentType,
  validateRoute,
  checkBodySize,
  parseBody,
  initAuth,
  waitForListen,
  buildListenResult,
  extractFrontierWriters,
  type HttpSyncServerOptions,
  type JsonHttpResponse,
  type ListenResult,
  type GraphHandle,
} from './HttpSyncServerHelpers.ts';
import type HttpServerPort from '../../../ports/HttpServerPort.ts';

export default class HttpSyncServer {
  private readonly _httpPort: HttpServerPort;
  private readonly _graph: GraphHandle;
  readonly _path: string;
  readonly _host: string;
  readonly _maxRequestBytes: number;
  private readonly _auth: SyncAuthService | null;
  private readonly _authMode: string | null;

  constructor(options: HttpSyncServerOptions) {
    const parsed = parseOptions(options);

    this._httpPort = parsed.httpPort;
    this._graph = parsed.graph;
    this._path = parsed.path;
    this._host = parsed.host;
    this._maxRequestBytes = parsed.maxRequestBytes;
    const authInit = initAuth(parsed.auth, parsed.allowedWriters);
    this._auth = authInit.auth;
    this._authMode = authInit.authMode;
  }

  /**
   * Runs auth verification and writer whitelist checks. Returns an error
   * response when enforcement blocks the request, or null to proceed.
   *
   * In log-only mode both checks record metrics/logs but always return
   * null so the request proceeds.
   */
  private async _authorize(
    request: { method: string; url: string; headers: Record<string, string>; body?: Uint8Array },
    parsed: Record<string, unknown>,
  ): Promise<JsonHttpResponse | null> {
    if (this._auth === null) {
      return null;
    }

    const sigError = await this._verifySignature(request);
    if (sigError !== null) {
      return sigError;
    }

    return this._checkWriterWhitelist(parsed);
  }

  /**
   * Verifies the request signature via SyncAuthService.
   */
  private async _verifySignature(
    request: { method: string; url: string; headers: Record<string, string>; body?: Uint8Array },
  ): Promise<JsonHttpResponse | null> {
    const auth = this._auth as SyncAuthService;
    const authResult = await auth.verify(request);
    if (!authResult.ok) {
      if (this._authMode === 'enforce') {
        return errorResponse(authResult.status, authResult.reason);
      }
      auth.recordLogOnlyPassthrough();
    }
    return null;
  }

  /**
   * Checks writer IDs from the request frontier against the whitelist.
   */
  private _checkWriterWhitelist(parsed: Record<string, unknown>): JsonHttpResponse | null {
    const auth = this._auth as SyncAuthService;
    const writerIds = extractFrontierWriters(parsed);
    if (writerIds.length === 0) {
      return null;
    }
    const writerResult = auth.enforceWriters(writerIds);
    if (!writerResult.ok) {
      return errorResponse(writerResult.status, writerResult.reason);
    }
    return null;
  }

  /**
   * Handles an incoming HTTP request through the sync pipeline.
   */
  private async _handleRequest(request: HttpRequest): Promise<JsonHttpResponse> {
    const req = {
      method: request.method,
      url: request.url,
      headers: request.headers,
      ...(request.body !== undefined ? { body: request.body } : {}),
    };
    const preflightError = this._preflight(req);
    if (preflightError !== null) {
      return preflightError;
    }

    const { error, parsed } = parseBody(req.body);
    if (error !== null) {
      return error;
    }

    const authError = await this._authorize(req, parsed as unknown as Record<string, unknown>);
    if (authError !== null) {
      return authError;
    }

    return await this._executeSyncRequest(parsed);
  }

  /**
   * Runs content-type, route, and body-size validation.
   */
  private _preflight(req: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: Uint8Array;
  }): JsonHttpResponse | null {
    const contentTypeError = checkContentType(req.headers);
    if (contentTypeError !== null) {
      return contentTypeError;
    }
    const routeError = validateRoute(req, this._path, this._host);
    if (routeError !== null) {
      return routeError;
    }
    return checkBodySize(req.body, this._maxRequestBytes);
  }

  /**
   * Forwards the parsed sync request to the graph and wraps errors.
   */
  private async _executeSyncRequest(parsed: SyncRequest): Promise<JsonHttpResponse> {
    try {
      const response = await this._graph.processSyncRequest(parsed);
      return jsonResponse(response);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sync failed';
      return errorResponse(500, msg);
    }
  }

  /**
   * Starts the HTTP sync server.
   *
   * @param port - Port to listen on (0 for ephemeral)
   * @returns Server handle with `url` and `close()` method
   * @throws SyncError If port is not a number
   */
  async listen(port: number): Promise<ListenResult> {
    if (typeof port !== 'number') {
      throw new SyncError('listen() requires a numeric port', { code: 'E_SYNC_PROTOCOL' });
    }

    const server = this._httpPort.createServer(
      (request: HttpRequest) => this._handleRequest(request),
    );

    await waitForListen(server, port, this._host);

    return buildListenResult({ server, port, host: this._host, path: this._path });
  }
}
