/**
 * @typedef {Object} HttpRequest
 * @property {string} method - HTTP method (GET, POST, etc.)
 * @property {string} url - Request URL path + query string
 * @property {Record<string, string>} headers - Lowercased header map
 * @property {Uint8Array | undefined} body - Raw body bytes (undefined for bodiless requests)
 */

/**
 * @typedef {Object} HttpResponse
 * @property {number} [status] - HTTP status code (defaults to 200)
 * @property {Record<string, string>} [headers] - Response headers
 * @property {string | Uint8Array | null} [body] - Response body
 */

/**
 * @typedef {Object} HttpServerHandle
 * @property {(port: number, host?: string | ((err?: Error | null) => void), callback?: (err?: Error | null) => void) => void} listen
 * @property {(callback?: (err?: Error) => void) => void} close
 * @property {() => { address: string, port: number, family: string } | null} address
 */

/**
 * Port for HTTP server creation.
 *
 * Abstracts platform-specific HTTP server APIs so domain code
 * doesn't depend on node:http directly.
 */
export default class HttpServerPort {
  /**
   * Creates an HTTP server with a platform-agnostic request handler.
   *
   * The request handler receives a plain object `{ method, url, headers, body }`
   * and must return `{ status, headers, body }`. No raw req/res objects
   * are exposed to the domain.
   *
   * @param {(request: HttpRequest) => Promise<HttpResponse>} _requestHandler - Async function (request) => response
   * @returns {HttpServerHandle} Server with listen(port, [host], cb(err)), close(cb), and address()
   */
  createServer(_requestHandler) {
    throw new Error('HttpServerPort.createServer() not implemented');
  }
}
