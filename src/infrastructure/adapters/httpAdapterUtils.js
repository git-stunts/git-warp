/**
 * Shared utilities for HTTP server adapters.
 *
 * Extracted from NodeHttpAdapter, BunHttpAdapter, and DenoHttpAdapter
 * to eliminate duplicated constants and body-reading logic (B135).
 *
 * @module infrastructure/adapters/httpAdapterUtils
 * @private
 */

import WarpError from '../../domain/errors/WarpError.js';

/**
 * Error thrown when a request body exceeds the size limit.
 * @class PayloadTooLargeError
 * @extends WarpError
 */
class PayloadTooLargeError extends WarpError {
  /**
   * Creates a PayloadTooLargeError.
   * @param {number} totalBytes - Number of bytes received before rejection
   */
  constructor(totalBytes) {
    super('Payload Too Large', 'E_PAYLOAD_TOO_LARGE', { context: { totalBytes } });
    /** @type {number} */
    this.status = 413;
  }
}

/** Absolute streaming body limit (10 MB). */
export const MAX_BODY_BYTES = 10 * 1024 * 1024;

/**
 * Reads a ReadableStream body with a byte-count limit.
 * Aborts immediately when the limit is exceeded, preventing full buffering.
 *
 * Used by BunHttpAdapter and DenoHttpAdapter (which receive Web ReadableStream bodies).
 * NodeHttpAdapter uses its own Node.js stream-based body reading.
 *
 * @param {ReadableStream} bodyStream
 * @returns {Promise<Uint8Array|undefined>}
 */
export async function readStreamBody(bodyStream) {
  const reader = bodyStream.getReader();
  /** @type {Uint8Array[]} */
  const chunks = [];
  let total = 0;
  for (;;) {
    /** @type {{ done: boolean, value?: Uint8Array }} */
    const result = await reader.read();
    if (result.done) {
      break;
    }
    const chunk = /** @type {Uint8Array} */ (result.value);
    total += chunk.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new PayloadTooLargeError(total);
    }
    chunks.push(chunk);
  }
  return assembleChunks(chunks, total);
}

/**
 * Assembles an array of Uint8Array chunks into a single Uint8Array.
 *
 * @param {Uint8Array[]} chunks - The collected chunks
 * @param {number} total - Total byte length
 * @returns {Uint8Array|undefined} Combined bytes, or undefined if empty
 */
function assembleChunks(chunks, total) {
  if (total === 0) {
    return undefined;
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** No-op logger matching the `{ error(...) }` interface. */
export const noopLogger = { error() {} };

// ── Shared error response bodies ────────────────────────────────────────────

export const ERROR_BODY = 'Internal Server Error';
export const ERROR_BODY_BYTES = new TextEncoder().encode(ERROR_BODY);
export const ERROR_BODY_LENGTH = String(ERROR_BODY_BYTES.byteLength);

export const PAYLOAD_TOO_LARGE_BODY = 'Payload Too Large';
export const PAYLOAD_TOO_LARGE_BYTES = new TextEncoder().encode(PAYLOAD_TOO_LARGE_BODY);
export const PAYLOAD_TOO_LARGE_LENGTH = String(PAYLOAD_TOO_LARGE_BYTES.byteLength);

// ── Shared request conversion ───────────────────────────────────────────────

/**
 * Converts a Web API Request into the plain-object format expected by
 * HttpServerPort request handlers.
 *
 * Used by both BunHttpAdapter and DenoHttpAdapter.
 *
 * @param {Request} request - Web API Request
 * @returns {Promise<{ method: string, url: string, headers: Record<string, string>, body: Uint8Array|undefined }>}
 */
export async function toPortRequest(request) {
  /** @type {Record<string, string>} */
  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const body = await readRequestBody(request, headers);

  const parsedUrl = new URL(request.url);
  return {
    method: request.method,
    url: parsedUrl.pathname + parsedUrl.search,
    headers,
    body,
  };
}

/**
 * Checks the Content-Length header and throws if it exceeds the limit.
 *
 * @param {Record<string, string>} headers - Parsed request headers
 * @throws {PayloadTooLargeError} If the declared content length exceeds the limit
 */
function enforceContentLengthLimit(headers) {
  const cl = headers['content-length'];
  if (cl !== undefined && Number(cl) > MAX_BODY_BYTES) {
    throw new PayloadTooLargeError(Number(cl));
  }
}

/**
 * Reads the request body if the method allows one.
 *
 * @param {Request} request - Web API Request
 * @param {Record<string, string>} headers - Parsed headers
 * @returns {Promise<Uint8Array|undefined>} The body bytes, or undefined
 */
async function readRequestBody(request, headers) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return undefined;
  }
  enforceContentLengthLimit(headers);
  if (request.body) {
    return await readStreamBody(request.body);
  }
  return undefined;
}
