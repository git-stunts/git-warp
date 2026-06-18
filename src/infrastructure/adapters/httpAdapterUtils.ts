/**
 * Shared utilities for HTTP server adapters.
 *
 * Extracted from NodeHttpAdapter, BunHttpAdapter, and DenoHttpAdapter
 * to eliminate duplicated constants and body-reading logic (B135).
 *
 * @module infrastructure/adapters/httpAdapterUtils
 * @private
 */

import WarpError from '../../domain/errors/WarpError.ts';
import { HttpRequest } from '../../ports/HttpServerPort.ts';

/**
 * Error thrown when a request body exceeds the size limit.
 */
class PayloadTooLargeError extends WarpError {
  readonly status: number;

  constructor(totalBytes: number) {
    super('Payload Too Large', 'E_PAYLOAD_TOO_LARGE', { context: { totalBytes } });
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
 */
export async function readStreamBody(bodyStream: ReadableStream<Uint8Array>): Promise<Uint8Array | undefined> {
  const reader = bodyStream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const result = await reader.read();
    if (result.done) {
      break;
    }
    const chunk = result.value;
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
 */
function assembleChunks(chunks: Uint8Array[], total: number): Uint8Array | undefined {
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
export const noopLogger: { error(...args: unknown[]): void } = { error() {} };

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
 */
export async function toPortRequest(request: Request): Promise<HttpRequest> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const body = await readRequestBody(request, headers);

  const parsedUrl = new URL(request.url);
  return new HttpRequest({
    method: request.method,
    url: parsedUrl.pathname + parsedUrl.search,
    headers,
    body,
  });
}

/**
 * Checks the Content-Length header and throws if it exceeds the limit.
 */
function enforceContentLengthLimit(headers: Record<string, string>): void {
  const cl = headers['content-length'];
  if (cl !== undefined && Number(cl) > MAX_BODY_BYTES) {
    throw new PayloadTooLargeError(Number(cl));
  }
}

/**
 * Reads the request body if the method allows one.
 */
async function readRequestBody(
  request: Request,
  headers: Record<string, string>,
): Promise<Uint8Array | undefined> {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return undefined;
  }
  enforceContentLengthLimit(headers);
  if (request.body) {
    return await readStreamBody(request.body);
  }
  return undefined;
}
