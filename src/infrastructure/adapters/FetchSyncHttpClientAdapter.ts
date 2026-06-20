/**
 * SyncHttpClient adapter over the platform `fetch` API.
 *
 * Implements `SyncHttpClientPort` using `globalThis.fetch` for HTTP
 * dispatch and `JSON.stringify` / `Response.json()` for body
 * serialization. This is the default transport for
 * `SyncController.syncWith(remote)` when the remote is a URL rather
 * than an in-process peer.
 *
 * Keeping this adapter in `src/infrastructure/adapters/` preserves
 * the hexagonal wall: `fetch` and `JSON.stringify` stay out of
 * `src/domain/**`.
 */

import { timeout, TimeoutError } from '@git-stunts/alfred';
import SyncHttpClientPort, {
  type SyncHttpAuth,
  type SyncHttpClientRequest,
  type SyncHttpClientResult,
  type SyncHttpClientTelemetry,
} from '../../ports/SyncHttpClientPort.ts';
import type { SyncResponse } from '../../domain/services/sync/SyncProtocol.ts';
import { signSyncRequest, canonicalizePath } from '../../domain/services/sync/SyncAuthService.ts';

/**
 * Implementation of SyncHttpClientPort using `fetch`.
 */
export default class FetchSyncHttpClientAdapter extends SyncHttpClientPort {
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
      const response = await timeout(request.timeoutMs, (timeoutSignal: AbortSignal) => {
        const combinedSignal = request.signal
          ? AbortSignal.any([timeoutSignal, request.signal])
          : timeoutSignal;
        return fetch(request.targetUrl.toString(), {
          method: 'POST',
          headers,
          body: bodyStr,
          signal: combinedSignal,
        });
      });
      return { kind: 'http-response', response };
    } catch (err) {
      return classifyTransportError(err);
    }
  }

  /**
   * Inspects an HTTP response status and body, producing the final
   * SyncHttpClientResult. Body decoding uses `.json()` which itself
   * may throw — we translate that into a decode-failure variant.
   */
  private async _interpretResponse(response: Response): Promise<SyncHttpClientResult> {
    if (response.status >= 400) {
      return { kind: 'status-failure', status: response.status };
    }
    try {
      const body = await response.json() as SyncResponse;
      return { kind: 'success', status: response.status, response: body };
    } catch {
      return { kind: 'decode-failure', status: response.status };
    }
  }
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
      lamport: auth.lamport,
      authScheme: auth.scheme,
    },
    { crypto: auth.crypto },
  );
}

/**
 * Classifies an exception thrown from the fetch/timeout path into a
 * typed SyncHttpClientResult variant.
 */
function classifyTransportError(err: unknown): SyncHttpClientResult {
  if (err instanceof TimeoutError) { return { kind: 'timeout' }; }
  if (err instanceof Error && err.name === 'AbortError') { return { kind: 'aborted' }; }
  const message = err instanceof Error ? err.message : String(err);
  return { kind: 'network-failure', message };
}
