/**
 * Port for HTTP server creation.
 *
 * Abstracts platform-specific HTTP server APIs so domain code
 * doesn't depend on node:http directly.
 */

export interface HttpRequest {
  /** HTTP method (GET, POST, etc.) */
  method: string;
  /** Request URL path + query string */
  url: string;
  /** Lowercased header map */
  headers: Record<string, string>;
  /** Raw body bytes (undefined for bodiless requests) */
  body: Uint8Array | undefined;
}

export interface HttpResponse {
  /** HTTP status code (defaults to 200) */
  status?: number;
  /** Response headers */
  headers?: Record<string, string>;
  /** Response body */
  body?: string | Uint8Array | null;
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
   * The request handler receives a plain object `{ method, url, headers, body }`
   * and must return `{ status, headers, body }`. No raw req/res objects
   * are exposed to the domain.
   */
  abstract createServer(
    _requestHandler: (request: HttpRequest) => Promise<HttpResponse>,
  ): HttpServerHandle;
}
