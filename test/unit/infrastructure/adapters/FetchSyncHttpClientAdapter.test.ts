import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHARED_SECRET_HMAC_SYNC_AUTH_SCHEME } from '../../../../src/domain/services/sync/SyncAuthService.ts';
import SyncSecret from '../../../../src/domain/services/sync/SyncSecret.ts';
import FetchSyncHttpClientAdapter, {
  DEFAULT_MAX_SYNC_RESPONSE_BYTES,
} from '../../../../src/infrastructure/adapters/FetchSyncHttpClientAdapter.ts';
import defaultCrypto from '../../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import OperationPolicyPort from '../../../../src/ports/OperationPolicyPort.ts';
import type { SyncHttpClientResult, SyncHttpClientTelemetry } from '../../../../src/ports/SyncHttpClientPort.ts';
import type { SyncRequest } from '../../../../src/domain/services/sync/SyncProtocol.ts';
import ManualClock from '../../../helpers/ManualClock.ts';
import SeededRandomPort from '../../../helpers/SeededRandomPort.ts';

const TARGET = new URL('http://peer.invalid/sync');
const BODY: SyncRequest = { type: 'sync-request', frontier: {} };
const HEADERS = { 'content-type': 'application/json' };
const TIMEOUT_MS = 1_000;
const EMPTY_RESPONSE = '{"type":"sync-response","frontier":{},"patches":[]}';

/** Runs each operation once and hands it the policy's own signal, or none. */
class FixedSignalPolicy extends OperationPolicyPort {
  constructor(private readonly signal: AbortSignal | undefined) {
    super();
  }

  override async execute<T>(operation: (signal?: AbortSignal) => Promise<T>): Promise<T> {
    return await operation(this.signal);
  }

  override async stream<T>(operation: (signal?: AbortSignal) => Promise<AsyncIterable<T>>): Promise<AsyncIterable<T>> {
    return await operation(this.signal);
  }
}

/** A policy whose execution rejects with a value that is not an Error. */
class NonErrorRejectingPolicy extends OperationPolicyPort {
  constructor(private readonly reason: string) {
    super();
  }

  override execute<T>(): Promise<T> {
    return Promise.reject(this.reason);
  }

  override stream<T>(): Promise<AsyncIterable<T>> {
    return Promise.reject(this.reason);
  }
}

type FetchCall = { readonly url: string; readonly init: RequestInit };

/** Platform fetch as far as this adapter uses it: an aborted signal rejects with an AbortError. */
function installFetch(): FetchCall[] {
  const calls: FetchCall[] = [];
  vi.stubGlobal('fetch', (url: string, init: RequestInit): Promise<Response> => {
    calls.push({ url, init });
    if (init.signal?.aborted === true) {
      return Promise.reject(new DOMException('This operation was aborted', 'AbortError'));
    }
    return Promise.resolve(new Response(EMPTY_RESPONSE, { status: 200 }));
  });
  return calls;
}

const SILENT: SyncHttpClientTelemetry = { onRequestSent: () => {}, onResponseReceived: () => {} };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FetchSyncHttpClientAdapter', () => {
  it('passes the caller abort signal to fetch when the policy supplies none', async () => {
    const calls = installFetch();
    const caller = new AbortController();
    const adapter = new FetchSyncHttpClientAdapter({ policy: new FixedSignalPolicy(undefined) });

    await adapter.exchange({ targetUrl: TARGET, body: BODY, headers: HEADERS, timeoutMs: TIMEOUT_MS, signal: caller.signal }, SILENT);

    expect(calls.map(({ init }) => init.signal)).toEqual([caller.signal]);
  });

  it('aborts on the caller signal although the policy supplies a live signal of its own', async () => {
    installFetch();
    const adapter = new FetchSyncHttpClientAdapter({ policy: new FixedSignalPolicy(new AbortController().signal) });

    const result = await adapter.exchange(
      { targetUrl: TARGET, body: BODY, headers: HEADERS, timeoutMs: TIMEOUT_MS, signal: AbortSignal.abort() },
      SILENT,
    );

    expect(result).toEqual({ kind: 'aborted' });
  });

  it('completes the exchange when neither the policy nor the caller supplies a signal', async () => {
    installFetch();
    const adapter = new FetchSyncHttpClientAdapter({ policy: new FixedSignalPolicy(undefined) });

    const result = await adapter.exchange({ targetUrl: TARGET, body: BODY, headers: HEADERS, timeoutMs: TIMEOUT_MS }, SILENT);

    expect(result).toEqual({ kind: 'success', status: 200, response: { type: 'sync-response', frontier: {}, patches: [] } });
  });

  it('signs under the default key id when the auth names none', async () => {
    const calls = installFetch();
    const adapter = new FetchSyncHttpClientAdapter({ policy: new FixedSignalPolicy(undefined) });

    await adapter.exchange({
      targetUrl: TARGET, body: BODY, headers: HEADERS, timeoutMs: TIMEOUT_MS,
      auth: {
        scheme: SHARED_SECRET_HMAC_SYNC_AUTH_SCHEME, secret: SyncSecret.fromString('default-key-test-secret'),
        crypto: defaultCrypto, random: new SeededRandomPort(1112), clock: new ManualClock(),
      },
    }, SILENT);

    // Oracle: a sync server configured as `keys: { default: secret }` serves unnamed clients.
    expect(calls.map(({ init }) => new Headers(init.headers).get('x-warp-key-id'))).toEqual(['default']);
  });

  it('reports a rejection that is not an Error as a network failure carrying its text', async () => {
    installFetch();
    const adapter = new FetchSyncHttpClientAdapter({ policy: new NonErrorRejectingPolicy('connection reset by peer') });

    const result = await adapter.exchange({ targetUrl: TARGET, body: BODY, headers: HEADERS, timeoutMs: TIMEOUT_MS }, SILENT);

    expect(result).toEqual({ kind: 'network-failure', message: 'connection reset by peer' });
  });
});

/** A small injected limit, so each case moves a few bytes and not 512 MiB. */
const LIMIT = 64;
const CHUNK_BYTES = 16;
const OVERSIZED_BYTES = LIMIT * 4;
const TOO_LARGE = { kind: 'response-too-large', status: 200, maxBytes: LIMIT };
const SYNC_RESPONSE_PREFIX = '{"type":"sync-response","frontier":{},"patches":[],"pad":"';
const SYNC_RESPONSE_SUFFIX = '"}';

/** A valid sync response of exactly `byteLength` UTF-8 bytes. */
function syncResponseBytes(byteLength: number): Uint8Array {
  const padBytes = byteLength - SYNC_RESPONSE_PREFIX.length - SYNC_RESPONSE_SUFFIX.length;
  return new TextEncoder().encode(`${SYNC_RESPONSE_PREFIX}${'x'.repeat(padBytes)}${SYNC_RESPONSE_SUFFIX}`);
}

/** The value the success variant carries for `syncResponseBytes(byteLength)`. */
function decodedSyncResponse(byteLength: number): object {
  const padBytes = byteLength - SYNC_RESPONSE_PREFIX.length - SYNC_RESPONSE_SUFFIX.length;
  return { type: 'sync-response', frontier: {}, patches: [], pad: 'x'.repeat(padBytes) };
}

/**
 * A pull-only body source. With a zero high-water mark the stream pulls
 * only for a pending read, so `pulledBytes` counts what the client read.
 */
class BodySource {
  pulledBytes = 0;
  cancelled = false;
  readonly stream: ReadableStream<Uint8Array>;

  constructor(chunks: readonly Uint8Array[]) {
    let next = 0;
    this.stream = new ReadableStream<Uint8Array>({
      pull: (controller) => {
        const chunk = chunks[next];
        next += 1;
        if (chunk === undefined) { controller.close(); return; }
        this.pulledBytes += chunk.byteLength;
        controller.enqueue(chunk);
      },
      cancel: () => { this.cancelled = true; },
    }, { highWaterMark: 0 });
  }

  static of(bytes: Uint8Array): BodySource {
    const chunks: Uint8Array[] = [];
    for (let offset = 0; offset < bytes.byteLength; offset += CHUNK_BYTES) {
      chunks.push(bytes.subarray(offset, offset + CHUNK_BYTES));
    }
    return new BodySource(chunks);
  }
}

function respondWith(response: Response): void {
  vi.stubGlobal('fetch', (): Promise<Response> => Promise.resolve(response));
}

function contentLength(byteLength: number | string): HeadersInit {
  return { 'content-type': 'application/json', 'content-length': String(byteLength) };
}

async function exchangeWithLimit(maxResponseBytes: number = LIMIT): Promise<SyncHttpClientResult> {
  const adapter = new FetchSyncHttpClientAdapter({ policy: new FixedSignalPolicy(undefined), maxResponseBytes });
  return await adapter.exchange({ targetUrl: TARGET, body: BODY, headers: HEADERS, timeoutMs: TIMEOUT_MS }, SILENT);
}

describe('FetchSyncHttpClientAdapter response limit (#1135)', () => {
  it('refuses a response whose correct Content-Length is over the limit', async () => {
    const bytes = syncResponseBytes(OVERSIZED_BYTES);
    respondWith(new Response(BodySource.of(bytes).stream, { headers: contentLength(bytes.byteLength) }));

    expect(await exchangeWithLimit()).toEqual(TOO_LARGE);
  });

  it('reads no body byte when Content-Length is over the limit', async () => {
    const bytes = syncResponseBytes(OVERSIZED_BYTES);
    const source = BodySource.of(bytes);
    respondWith(new Response(source.stream, { headers: contentLength(bytes.byteLength) }));

    await exchangeWithLimit();

    expect({ pulledBytes: source.pulledBytes, cancelled: source.cancelled }).toEqual({ pulledBytes: 0, cancelled: true });
  });

  it('refuses a chunked response with no Content-Length once its body passes the limit', async () => {
    respondWith(new Response(BodySource.of(syncResponseBytes(OVERSIZED_BYTES)).stream));

    expect(await exchangeWithLimit()).toEqual(TOO_LARGE);
  });

  it('refuses a response whose Content-Length understates its body', async () => {
    const bytes = syncResponseBytes(OVERSIZED_BYTES);
    respondWith(new Response(BodySource.of(bytes).stream, { headers: contentLength(LIMIT / 2) }));

    expect(await exchangeWithLimit()).toEqual(TOO_LARGE);
  });

  it('stops reading an endless body one chunk past the limit and cancels it', async () => {
    // Bounded at 1,024 chunks so that an unbounded read ends and fails the assertion instead of hanging.
    const source = new BodySource(Array.from({ length: 1024 }, () => new TextEncoder().encode('x'.repeat(CHUNK_BYTES))));
    respondWith(new Response(source.stream));

    const result = await exchangeWithLimit();

    expect({ result, pulledBytes: source.pulledBytes, cancelled: source.cancelled })
      .toEqual({ result: TOO_LARGE, pulledBytes: LIMIT + CHUNK_BYTES, cancelled: true });
  });

  it.each([
    { byteLength: LIMIT, expected: { kind: 'success', status: 200, response: decodedSyncResponse(LIMIT) } },
    { byteLength: LIMIT + 1, expected: TOO_LARGE },
  ])(`treats a streamed body of $byteLength bytes against the ${LIMIT}-byte limit`, async ({ byteLength, expected }) => {
    respondWith(new Response(BodySource.of(syncResponseBytes(byteLength)).stream));

    expect(await exchangeWithLimit()).toEqual(expected);
  });

  it.each([
    { byteLength: LIMIT, expected: { kind: 'success', status: 200, response: decodedSyncResponse(LIMIT) } },
    { byteLength: LIMIT + 1, expected: TOO_LARGE },
  ])(`treats a declared body of $byteLength bytes against the ${LIMIT}-byte limit`, async ({ byteLength, expected }) => {
    const bytes = syncResponseBytes(byteLength);
    respondWith(new Response(BodySource.of(bytes).stream, { headers: contentLength(bytes.byteLength) }));

    expect(await exchangeWithLimit()).toEqual(expected);
  });

  it('applies the 512 MiB default limit when the adapter is given none', async () => {
    respondWith(new Response(BodySource.of(syncResponseBytes(LIMIT)).stream, { headers: contentLength(536_870_913) }));
    const adapter = new FetchSyncHttpClientAdapter({ policy: new FixedSignalPolicy(undefined) });

    const result = await adapter.exchange({ targetUrl: TARGET, body: BODY, headers: HEADERS, timeoutMs: TIMEOUT_MS }, SILENT);

    // Oracle: the #1135 decision sets the default to 512 MiB, 536,870,912 bytes.
    expect(result).toEqual({ kind: 'response-too-large', status: 200, maxBytes: 536_870_912 });
  });

  it('names the default limit 512 MiB', () => {
    // Oracle: the #1135 decision; the Node 22 string ceiling is 536,870,888 UTF-16 code units.
    expect(DEFAULT_MAX_SYNC_RESPONSE_BYTES).toBe(536_870_912);
  });

  it('reads a body whose Content-Length is exactly the default limit', async () => {
    respondWith(new Response(BodySource.of(syncResponseBytes(LIMIT)).stream, { headers: contentLength(536_870_912) }));
    const adapter = new FetchSyncHttpClientAdapter({ policy: new FixedSignalPolicy(undefined) });

    const result = await adapter.exchange({ targetUrl: TARGET, body: BODY, headers: HEADERS, timeoutMs: TIMEOUT_MS }, SILENT);

    expect(result).toEqual({ kind: 'success', status: 200, response: decodedSyncResponse(LIMIT) });
  });

  it('counts the body instead of trusting a Content-Length that is not a decimal byte count', async () => {
    respondWith(new Response(BodySource.of(syncResponseBytes(LIMIT)).stream, { headers: contentLength('1e9') }));

    expect(await exchangeWithLimit()).toEqual({ kind: 'success', status: 200, response: decodedSyncResponse(LIMIT) });
  });

  it('reports a response with no body as a decode failure', async () => {
    respondWith(new Response(null, { status: 200 }));

    expect(await exchangeWithLimit()).toEqual({ kind: 'decode-failure', status: 200 });
  });

  it('reports a body that fails while it streams as a decode failure', async () => {
    respondWith(new Response(new ReadableStream<Uint8Array>({
      pull: (controller) => { controller.error(new TypeError('terminated')); },
    }, { highWaterMark: 0 })));

    expect(await exchangeWithLimit()).toEqual({ kind: 'decode-failure', status: 200 });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])('refuses a response limit of %s', (maxResponseBytes) => {
    expect(() => new FetchSyncHttpClientAdapter({ maxResponseBytes }))
      .toThrow(expect.objectContaining({ code: 'E_SYNC_CLIENT_OPTION_INVALID' }));
  });
});
