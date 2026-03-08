import { describe, it, expect } from 'vitest';
import {
  readStreamBody,
  toPortRequest,
  MAX_BODY_BYTES,
  ERROR_BODY,
  ERROR_BODY_BYTES,
  ERROR_BODY_LENGTH,
  PAYLOAD_TOO_LARGE_BODY,
  PAYLOAD_TOO_LARGE_BYTES,
  PAYLOAD_TOO_LARGE_LENGTH,
  noopLogger,
} from '../../../../src/infrastructure/adapters/httpAdapterUtils.js';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Build a ReadableStream from an array of Uint8Array chunks. */
function streamFrom(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

// ── readStreamBody ───────────────────────────────────────────────────────────

describe('readStreamBody', () => {
  it('returns undefined for an empty stream', async () => {
    const result = await readStreamBody(streamFrom([]));
    expect(result).toBeUndefined();
  });

  it('concatenates a single chunk', async () => {
    const data = new Uint8Array([1, 2, 3]);
    const result = await readStreamBody(streamFrom([data]));
    expect(result).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('concatenates multiple chunks', async () => {
    const a = new Uint8Array([10, 20]);
    const b = new Uint8Array([30, 40, 50]);
    const result = await readStreamBody(streamFrom([a, b]));
    expect(result).toEqual(new Uint8Array([10, 20, 30, 40, 50]));
  });

  it('throws 413 when total exceeds MAX_BODY_BYTES', async () => {
    // Stream two chunks that together exceed the limit.
    const big = new Uint8Array(MAX_BODY_BYTES);
    const extra = new Uint8Array([1]);
    await expect(readStreamBody(streamFrom([big, extra])))
      .rejects.toMatchObject({ message: 'Payload Too Large', status: 413 });
  });

  it('returns Uint8Array, not Buffer', async () => {
    const result = await readStreamBody(streamFrom([new Uint8Array([0])]));
    expect(result).toBeInstanceOf(Uint8Array);
    // Ensure it's a plain Uint8Array, not a Buffer subclass.
    expect(Object.getPrototypeOf(result)).toBe(Uint8Array.prototype);
  });
});

// ── toPortRequest ────────────────────────────────────────────────────────────

describe('toPortRequest', () => {
  it('converts a GET request with no body', async () => {
    const req = new Request('http://localhost:3000/foo?bar=1', { method: 'GET' });
    const result = await toPortRequest(req);
    expect(result.method).toBe('GET');
    expect(result.url).toBe('/foo?bar=1');
    expect(result.body).toBeUndefined();
  });

  it('converts a POST request with a body', async () => {
    const payload = JSON.stringify({ hello: 'world' });
    const req = new Request('http://localhost:3000/api', {
      method: 'POST',
      body: payload,
      headers: { 'content-type': 'application/json' },
    });
    const result = await toPortRequest(req);
    expect(result.method).toBe('POST');
    expect(result.url).toBe('/api');
    expect(result.body).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(result.body)).toBe(payload);
    expect(result.headers['content-type']).toBe('application/json');
  });

  it('rejects POST when content-length exceeds limit', async () => {
    const req = new Request('http://localhost:3000/api', {
      method: 'POST',
      body: 'x',
      headers: { 'content-length': String(MAX_BODY_BYTES + 1) },
    });
    await expect(toPortRequest(req))
      .rejects.toMatchObject({ message: 'Payload Too Large', status: 413 });
  });

  it('skips body reading for HEAD requests', async () => {
    const req = new Request('http://localhost:3000/', { method: 'HEAD' });
    const result = await toPortRequest(req);
    expect(result.body).toBeUndefined();
  });
});

// ── constants ────────────────────────────────────────────────────────────────

describe('shared constants', () => {
  it('MAX_BODY_BYTES is 10 MB', () => {
    expect(MAX_BODY_BYTES).toBe(10 * 1024 * 1024);
  });

  it('error body constants are consistent', () => {
    expect(ERROR_BODY).toBe('Internal Server Error');
    expect(new TextDecoder().decode(ERROR_BODY_BYTES)).toBe(ERROR_BODY);
    expect(ERROR_BODY_LENGTH).toBe(String(ERROR_BODY_BYTES.byteLength));
  });

  it('payload-too-large constants are consistent', () => {
    expect(PAYLOAD_TOO_LARGE_BODY).toBe('Payload Too Large');
    expect(new TextDecoder().decode(PAYLOAD_TOO_LARGE_BYTES)).toBe(PAYLOAD_TOO_LARGE_BODY);
    expect(PAYLOAD_TOO_LARGE_LENGTH).toBe(String(PAYLOAD_TOO_LARGE_BYTES.byteLength));
  });

  it('noopLogger.error is a no-op', () => {
    expect(() => noopLogger.error('test')).not.toThrow();
  });
});
