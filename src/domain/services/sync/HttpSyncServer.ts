/**
 * HTTP sync server extracted from WarpRuntime.serve().
 *
 * Handles request routing, JSON parsing, validation, and error responses
 * for the sync protocol. All HTTP I/O flows through an HttpServerPort
 * so the domain never touches node:http directly.
 *
 * @module domain/services/sync/HttpSyncServer
 */

import SyncAuthService from './SyncAuthService.ts';
import SyncPeerRateLimiter, { DEFAULT_SYNC_PEER_RATE_LIMIT } from './SyncPeerRateLimiter.ts';
import SyncError from '../../errors/SyncError.ts';
import nullLogger from '../../utils/nullLogger.ts';
import type LogFields from '../../types/log/LogFields.ts';
import type { HttpRequest } from '../../../ports/HttpServerPort.ts';
import type LoggerPort from '../../../ports/LoggerPort.ts';
import type { SyncRequest } from './SyncProtocol.ts';
import {
  parseOptions,
  errorResponse,
  peerRateLimitedResponse,
  internalSyncErrorResponse,
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
  private readonly _logger: LoggerPort;
  readonly _path: string;
  readonly _host: string;
  readonly _maxRequestBytes: number;
  private readonly _auth: SyncAuthService | null;
  private readonly _authMode: string | null;
  private readonly _peerLimiter: SyncPeerRateLimiter;
  private readonly _metrics = { peerRateLimitRejects: 0 };
  private _warnedNoPeerAddress = false;

  constructor(options: HttpSyncServerOptions) {
    const parsed = parseOptions(options);

    this._httpPort = parsed.httpPort;
    this._graph = parsed.graph;
    this._logger = parsed.logger ?? nullLogger;
    this._path = parsed.path;
    this._host = parsed.host;
    this._maxRequestBytes = parsed.maxRequestBytes;
    const authInit = initAuth(parsed.auth, parsed.allowedWriters);
    this._auth = authInit.auth;
    this._authMode = authInit.authMode;
    this._peerLimiter = new SyncPeerRateLimiter(parsed.peerRateLimit ?? DEFAULT_SYNC_PEER_RATE_LIMIT, parsed.clock);
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
    parsed: Record<string, unknown>, // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
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
  private _checkWriterWhitelist(parsed: Record<string, unknown>): JsonHttpResponse | null { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
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
    const refusal = this._preflight(req, request.peerAddress);
    if (refusal !== null) {
      return refusal;
    }

    const { error, parsed } = parseBody(req.body);
    if (error !== null) {
      return error;
    }

    const authError = await this._authorize(req, parsed as unknown as Record<string, unknown>); // nosemgrep: ts-no-double-cast -- 0025A; nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
    if (authError !== null) {
      return authError;
    }

    return await this._executeSyncRequest(parsed);
  }

  /**
   * Runs content-type, route, signature retirement, and body-size validation,
   * then the peer admission gate. A request that the earlier checks refuse
   * keeps its own typed refusal and spends no peer budget.
   */
  private _preflight(req: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: Uint8Array;
  }, peerAddress: string | undefined): JsonHttpResponse | null {
    const contentTypeError = checkContentType(req.headers);
    if (contentTypeError !== null) {
      return contentTypeError;
    }
    const routeError = validateRoute(req, this._path, this._host);
    if (routeError !== null) {
      return routeError;
    }
    if (SyncAuthService.isRetiredVersion(req.headers['x-warp-sig-version'])) {
      return errorResponse(400, 'SIG_VERSION_RETIRED');
    }
    return checkBodySize(req.body, this._maxRequestBytes) ?? this._admitPeer(peerAddress);
  }

  /**
   * Spends one token of the socket peer's budget. Runs last in the preflight,
   * before the body parse and all authentication work, in every auth
   * mode, so a refused request costs no JSON parse, hash, HMAC or nonce.
   */
  private _admitPeer(peerAddress: string | undefined): JsonHttpResponse | null {
    if (peerAddress === undefined && !this._warnedNoPeerAddress) {
      this._warnedNoPeerAddress = true;
      this._logger.warn('sync server: requests without a socket peer address share one peer budget;'
        + ' the HttpServerPort adapter should set peerAddress from the connected socket');
    }
    const admission = this._peerLimiter.admit(peerAddress);
    if (admission.admitted) {
      return null;
    }
    const { peer, retryAfterSeconds } = admission;
    this._metrics.peerRateLimitRejects += 1;
    this._logger.warn('sync server: peer rate limit exceeded', { peer, retryAfterSeconds });
    return peerRateLimitedResponse(retryAfterSeconds);
  }

  /** Counts of server-level refusals; authentication counts live on SyncAuthService. */
  getMetrics(): { peerRateLimitRejects: number } {
    return { ...this._metrics };
  }

  /**
   * Forwards the parsed sync request to the graph and wraps errors.
   */
  private async _executeSyncRequest(parsed: SyncRequest): Promise<JsonHttpResponse> {
    try {
      const response = await this._graph.processSyncRequest(parsed);
      return jsonResponse(response);
    } catch (err) {
      this._logger.error(
        'sync server: processSyncRequest failed',
        syncFailureLogFields(err instanceof Error ? err : null),
      );
      return internalSyncErrorResponse();
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

function syncFailureLogFields(err: Error | null): LogFields {
  if (err !== null) {
    return { error: err };
  }
  return { thrownType: 'non-error' };
}
