/**
 * Port for HTTP server creation.
 *
 * Abstracts platform-specific HTTP server APIs so domain code
 * doesn't depend on node:http directly.
 */

import WarpError from '../domain/errors/WarpError.ts';

interface HttpRequestOptions {
  readonly method: string;
  readonly url: string;
  readonly headers: Record<string, string>;
  readonly body?: Uint8Array | undefined;
}

interface HttpResponseOptions {
  readonly status?: number | undefined;
  readonly headers?: Record<string, string> | undefined;
  readonly body?: string | Uint8Array | null | undefined;
}

export class HttpBoundaryError extends WarpError {
  constructor(message: string, field: string) {
    super(message, 'E_HTTP_BOUNDARY_INVALID', { context: { field } });
  }
}

export class HttpRequest {
  /** HTTP method (GET, POST, etc.) */
  readonly method: string;
  /** Request URL path + query string */
  readonly url: string;
  /** Lowercased header map */
  readonly headers: Record<string, string>;
  /** Raw body bytes (undefined for bodiless requests) */
  readonly body: Uint8Array | undefined;

  constructor(options: HttpRequestOptions) {
    assertRequestOptions(options);
    assertNonEmptyString(options.method, 'method');
    assertNonEmptyString(options.url, 'url');
    assertBody(options.body, 'body');
    this.method = options.method;
    this.url = options.url;
    this.headers = validatedHeaders(options.headers);
    this.body = options.body;
    Object.freeze(this);
  }

  static from(request: HttpRequest | HttpRequestOptions): HttpRequest {
    return request instanceof HttpRequest ? request : new HttpRequest(request);
  }
}

export class HttpResponse {
  /** HTTP status code (defaults to 200) */
  readonly status?: number | undefined;
  /** Response headers */
  readonly headers?: Record<string, string> | undefined;
  /** Response body */
  readonly body?: string | Uint8Array | null | undefined;

  constructor(options: HttpResponseOptions = {}) {
    assertResponseOptions(options);
    assertStatus(options.status);
    assertResponseBody(options.body);
    this.status = options.status;
    this.headers = options.headers === undefined ? undefined : validatedHeaders(options.headers);
    this.body = options.body;
    Object.freeze(this);
  }

  static from(response: HttpResponse | HttpResponseOptions): HttpResponse {
    return response instanceof HttpResponse ? response : new HttpResponse(response);
  }
}

function assertRequestOptions(options: HttpRequestOptions): void {
  if (options === null || typeof options !== 'object') {
    throw new HttpBoundaryError('HTTP request options must be an object', 'request');
  }
}

function assertResponseOptions(options: HttpResponseOptions): void {
  if (options === null || typeof options !== 'object') {
    throw new HttpBoundaryError('HTTP response options must be an object', 'response');
  }
}

function assertNonEmptyString(value: string, field: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new HttpBoundaryError(`HTTP ${field} must be a non-empty string`, field);
  }
}

function assertStatus(status: number | undefined): void {
  if (status === undefined) {
    return;
  }
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw new HttpBoundaryError('HTTP response status must be an integer from 100 through 599', 'status');
  }
}

function assertBody(body: Uint8Array | undefined, field: string): void {
  if (body !== undefined && !(body instanceof Uint8Array)) {
    throw new HttpBoundaryError(`HTTP ${field} must be Uint8Array or undefined`, field);
  }
}

function assertResponseBody(body: string | Uint8Array | null | undefined): void {
  if (body === undefined || body === null || typeof body === 'string' || body instanceof Uint8Array) {
    return;
  }
  throw new HttpBoundaryError('HTTP response body must be string, Uint8Array, null, or undefined', 'body');
}

function validatedHeaders(headers: Record<string, string>): Record<string, string> {
  if (headers === null || typeof headers !== 'object') {
    throw new HttpBoundaryError('HTTP headers must be an object', 'headers');
  }
  const validated: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    assertNonEmptyString(key, 'headers');
    assertNonEmptyString(value, `headers.${key}`);
    validated[key] = value;
  }
  Object.freeze(validated);
  return validated;
}

export interface HttpServerHandle {
  listen(
    port: number,
    host?: string | ((err?: Error | null) => void),
    callback?: (err?: Error | null) => void,
  ): void;
  close(callback?: (err?: Error) => void): void;
  address(): { address: string; port: number; family: string } | null;
}

/** Port for HTTP server creation. */
export default abstract class HttpServerPort {
  /**
   * Creates an HTTP server with a platform-agnostic request handler.
   *
   * The request handler receives an HttpRequest and must return an HttpResponse
   * shape `{ status, headers, body }`. No raw req/res objects
   * are exposed to the domain.
   */
  abstract createServer(
    _requestHandler: (request: HttpRequest) => Promise<HttpResponse>,
  ): HttpServerHandle;
}
