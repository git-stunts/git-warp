/**
 * Port for the outbound sync HTTP client.
 *
 * Abstracts the serialize-request → sign → POST → read-response cycle
 * used by `SyncController.syncWith()` so the domain never touches
 * `fetch`, `JSON.stringify`, or platform `Response` objects.
 *
 * The port takes an already-decoded domain `SyncRequest` on the way
 * in and returns an already-decoded `SyncResponse` on the way out.
 * Network / transport failures surface as an explicit result variant,
 * not an exception.
 */

import type { SyncRequest, SyncResponse } from '../domain/services/sync/SyncProtocol.ts';
import type SyncSecret from '../domain/services/sync/SyncSecret.ts';
import type CryptoPort from './CryptoPort.ts';

/**
 * Auth configuration carried on a sync exchange; the adapter uses
 * this to sign the request body after serialization.
 */
export interface SyncHttpAuth {
  readonly secret: SyncSecret;
  readonly keyId?: string;
  readonly lamport: number;
  readonly crypto: CryptoPort;
}

/** Input to a single sync HTTP exchange. */
export interface SyncHttpClientRequest {
  readonly targetUrl: URL;
  readonly body: SyncRequest;
  readonly headers: Record<string, string>;
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly auth?: SyncHttpAuth;
}

/** Observability hooks fired during a single exchange. */
export interface SyncHttpClientTelemetry {
  onRequestSent(): void;
  onResponseReceived(status: number): void;
}

/** Success: HTTP 2xx carrying a decoded SyncResponse. */
export interface SyncHttpClientSuccess {
  readonly kind: 'success';
  readonly status: number;
  readonly response: SyncResponse;
}

/** Transport-layer timeout (connect or response exceeded timeoutMs). */
export interface SyncHttpClientTimeout {
  readonly kind: 'timeout';
}

/** Caller's signal aborted the exchange. */
export interface SyncHttpClientAborted {
  readonly kind: 'aborted';
}

/** Network-layer failure (connect refused, DNS, TLS). */
export interface SyncHttpClientNetworkFailure {
  readonly kind: 'network-failure';
  readonly message: string;
}

/** Non-success HTTP status response (>= 400). */
export interface SyncHttpClientStatusFailure {
  readonly kind: 'status-failure';
  readonly status: number;
}

/** Response body failed to decode as SyncResponse. */
export interface SyncHttpClientDecodeFailure {
  readonly kind: 'decode-failure';
  readonly status: number;
}

/** Discriminated union of single-exchange outcomes. */
export type SyncHttpClientResult =
  | SyncHttpClientSuccess
  | SyncHttpClientTimeout
  | SyncHttpClientAborted
  | SyncHttpClientNetworkFailure
  | SyncHttpClientStatusFailure
  | SyncHttpClientDecodeFailure;

/** Port for outbound sync HTTP transport. */
export default abstract class SyncHttpClientPort {
  /**
   * Performs a single POST exchange for the given sync request.
   *
   * Returns a typed result object — never throws for network,
   * timeout, abort, HTTP status, or body-decode failures. Only
   * programmer-bug failures escape as exceptions.
   */
  abstract exchange(
    _request: SyncHttpClientRequest,
    _telemetry: SyncHttpClientTelemetry,
  ): Promise<SyncHttpClientResult>;
}
