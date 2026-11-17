/**
 * SyncHttpClient adapter over the platform `fetch` API.
 *
 * Implements `SyncHttpClientPort` using `globalThis.fetch` for HTTP
 * dispatch, `JSON.stringify` for the request body, and a bounded body
 * read plus `JSON.parse` for the response. This is the default
 * transport for `SyncController.syncWith(remote)` when the remote is a
 * URL rather than an in-process peer.
 *
 * Keeping this adapter in `src/infrastructure/adapters/` preserves
 * the hexagonal wall: `fetch`, `JSON.stringify` and `JSON.parse` stay
 * out of `src/domain/**`.
 */

import SyncHttpClientPort, {
  type SyncHttpAuth,
  type SyncHttpClientRequest,
  type SyncHttpClientResponseTooLarge,
  type SyncHttpClientResult,
  type SyncHttpClientTelemetry,
} from '../../ports/SyncHttpClientPort.ts';
import type { SyncResponse } from '../../domain/services/sync/SyncProtocol.ts';
import { signSyncRequest, canonicalizePath } from '../../domain/services/sync/SyncAuthService.ts';
import OperationPolicyTimeoutError from '../../domain/errors/OperationPolicyTimeoutError.ts';
import SyncError from '../../domain/errors/SyncError.ts';
import type OperationPolicyPort from '../../ports/OperationPolicyPort.ts';
import AlfredOperationPolicyAdapter from './AlfredOperationPolicyAdapter.ts';

/**
 * The most response-body bytes the client reads: 512 MiB (536,870,912 bytes).
 *
 * A sync server sends every patch that the request frontier does not have
 * in one response, so an honest response has no bound of its own (#1135).
 * The bound that already exists is the JavaScript string limit: on Node 22
 * a string holds at most 536,870,888 UTF-16 code units, and the server's
 * JSON encoder and the client's decoder each need the whole body as one
 * string. This limit is at that ceiling, so it refuses no response of
 * ASCII JSON that a Node client can decode, and it stops a peer that sends
 * more. Paging the sync protocol is the route to a lower limit.
 */
export const DEFAULT_MAX_SYNC_RESPONSE_BYTES = 512 * 1024 * 1024;

/** A `Content-Length` value that the client trusts: decimal digits only. */
const DECIMAL_BYTE_COUNT = /^\d+$/;

type FetchSyncHttpClientAdapterOptions = {
  readonly policy?: OperationPolicyPort;
  /** Test seam for a smaller limit; `syncWith` does not expose it. */
  readonly maxResponseBytes?: number;
};

/**
 * Implementation of SyncHttpClientPort using `fetch`.
 */
export default class FetchSyncHttpClientAdapter extends SyncHttpClientPort {
  private readonly _policy: OperationPolicyPort;
  private readonly _maxResponseBytes: number;

  constructor(options: FetchSyncHttpClientAdapterOptions = {}) {
    super();
    this._policy = options.policy ?? new AlfredOperationPolicyAdapter();
    this._maxResponseBytes = requireResponseLimit(options.maxResponseBytes ?? DEFAULT_MAX_SYNC_RESPONSE_BYTES);
  }

  async exchange(
    request: SyncHttpClientRequest,
    telemetry: SyncHttpClientTelemetry,
  ): Promise<SyncHttpClientResult> {
    const bodyStr = JSON.stringify(request.body);
    const headers = await resolveHeaders(request, bodyStr);
    telemetry.onRequestSent();

    const res = await this._sendRequest(request, bodyStr, headers);
    if (res.kind !== 'http-response') { return res; }

    telemetry.onResponseReceived(res.response.status);
    return await this._interpretResponse(res.response);
  }

  /**
   * Performs the `fetch` call, translating transport-level failures
   * (timeout, abort, network) into typed result variants.
   */
  private async _sendRequest(
    request: SyncHttpClientRequest,
    bodyStr: string,
    headers: Record<string, string>,
  ): Promise<{ kind: 'http-response'; response: Response } | SyncHttpClientResult> {
    try {
      const response = await this._policy.execute((policySignal?: AbortSignal) => {
        const combinedSignal = combineAbortSignals(policySignal, request.signal);
        const init: RequestInit = {
          method: 'POST',
          headers,
          body: bodyStr,
          ...(combinedSignal !== undefined ? { signal: combinedSignal } : {}),
        };
        return fetch(request.targetUrl.toString(), init);
      }, { timeoutMs: request.timeoutMs });
      return { kind: 'http-response', response };
    } catch (err) {
      return classifyTransportError(err);
    }
  }

  /**
   * Inspects an HTTP response status and body, producing the final
   * SyncHttpClientResult. A body over the response limit is refused
   * before it is parsed. A body that fails to stream or to decode
   * becomes a decode-failure variant.
   */
  private async _interpretResponse(response: Response): Promise<SyncHttpClientResult> {
    if (response.status >= 400) {
      return { kind: 'status-failure', status: response.status };
    }
    try {
      const body = await readBoundedBody(response, this._maxResponseBytes);
      if (body instanceof Uint8Array) {
        return { kind: 'success', status: response.status, response: decodeSyncResponse(body) };
      }
      return body;
    } catch {
      return { kind: 'decode-failure', status: response.status };
    }
  }
}

function requireResponseLimit(maxResponseBytes: number): number {
  if (Number.isSafeInteger(maxResponseBytes) && maxResponseBytes > 0) {
    return maxResponseBytes;
  }
  throw new SyncError('Sync response limit must be a positive safe integer', {
    code: 'E_SYNC_CLIENT_OPTION_INVALID',
    context: { maxResponseBytes },
  });
}

/**
 * Reads a response body of at most `maxBytes` bytes. A decimal
 * `Content-Length` over the limit refuses the body before any byte is
 * read. The streamed bytes are counted as well, because the header can
 * be absent or wrong. A refused body is cancelled, which releases the
 * connection.
 */
async function readBoundedBody(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array | SyncHttpClientResponseTooLarge> {
  const refusal: SyncHttpClientResponseTooLarge = { kind: 'response-too-large', status: response.status, maxBytes };
  const stream = response.body;
  if (stream === null) {
    return new Uint8Array(0);
  }
  if (declaresMoreThan(response.headers, maxBytes)) {
    await stream.cancel();
    return refusal;
  }
  return await readCountedBody(stream.getReader(), refusal);
}

/**
 * Collects the streamed chunks until the body ends, or cancels the body
 * and returns the refusal once the count passes `refusal.maxBytes`.
 */
async function readCountedBody(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  refusal: SyncHttpClientResponseTooLarge,
): Promise<Uint8Array | SyncHttpClientResponseTooLarge> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const read = await reader.read();
    if (read.done) {
      return concatenate(chunks, total);
    }
    total += read.value.byteLength;
    if (total > refusal.maxBytes) {
      await reader.cancel();
      return refusal;
    }
    chunks.push(read.value);
  }
}

function declaresMoreThan(headers: Headers, maxBytes: number): boolean {
  const declared = headers.get('content-length');
  return declared !== null && DECIMAL_BYTE_COUNT.test(declared) && Number(declared) > maxBytes;
}

function concatenate(chunks: readonly Uint8Array[], byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Decodes a bounded UTF-8 body as JSON, as `Response.json()` does. The
 * shape is not checked here: `SyncController` validates it with
 * `validateSyncResponse` before it uses the response.
 */
function decodeSyncResponse(bytes: Uint8Array): SyncResponse {
  return JSON.parse(new TextDecoder().decode(bytes)) as SyncResponse;
}

/**
 * Computes the final request headers — merges caller headers with
 * auth signatures computed from the serialized body.
 */
async function resolveHeaders(
  request: SyncHttpClientRequest,
  bodyStr: string,
): Promise<Record<string, string>> {
  if (request.auth === undefined) { return request.headers; }
  const authHeaders = await signForRequest(request.auth, request.targetUrl, bodyStr);
  return { ...request.headers, ...authHeaders };
}

/**
 * Signs a serialized body and returns the HMAC auth headers.
 */
async function signForRequest(
  auth: SyncHttpAuth,
  targetUrl: URL,
  bodyStr: string,
): Promise<Record<string, string>> {
  const bodyBuf = new TextEncoder().encode(bodyStr);
  return await signSyncRequest(
    {
      method: 'POST',
      path: canonicalizePath(targetUrl.pathname + (targetUrl.search || '')),
      contentType: 'application/json',
      body: bodyBuf,
      secret: auth.secret,
      keyId: auth.keyId !== undefined && auth.keyId !== '' ? auth.keyId : 'default',
      authScheme: auth.scheme,
    },
    { crypto: auth.crypto, random: auth.random, clock: auth.clock },
  );
}

/**
 * Classifies an exception thrown from the fetch/timeout path into a
 * typed SyncHttpClientResult variant.
 */
function classifyTransportError(err: unknown): SyncHttpClientResult {
  if (err instanceof OperationPolicyTimeoutError) { return { kind: 'timeout' }; }
  if (err instanceof Error && err.name === 'AbortError') { return { kind: 'aborted' }; }
  const message = err instanceof Error ? err.message : String(err);
  return { kind: 'network-failure', message };
}

function combineAbortSignals(
  first: AbortSignal | undefined,
  second: AbortSignal | undefined,
): AbortSignal | undefined {
  if (first === undefined) {
    return second;
  }
  if (second === undefined) {
    return first;
  }
  return AbortSignal.any([first, second]);
}
