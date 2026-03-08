/**
 * Shared utilities for HTTP server adapters.
 *
 * Extracted from NodeHttpAdapter, BunHttpAdapter, and DenoHttpAdapter
 * to eliminate duplicated constants and body-reading logic (B135).
 *
 * @module infrastructure/adapters/httpAdapterUtils
 * @private
 */

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
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      throw Object.assign(new Error('Payload Too Large'), { status: 413 });
    }
    chunks.push(value);
  }
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

  let body;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const cl = headers['content-length'];
    if (cl !== undefined && Number(cl) > MAX_BODY_BYTES) {
      throw Object.assign(new Error('Payload Too Large'), { status: 413 });
    }
    if (request.body) {
      body = await readStreamBody(request.body);
    }
  }

  const parsedUrl = new URL(request.url);
  return {
    method: request.method,
    url: parsedUrl.pathname + parsedUrl.search,
    headers,
    body,
  };
}
