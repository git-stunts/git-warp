import { afterEach, describe, expect, it, vi } from 'vitest';
import { SHARED_SECRET_HMAC_SYNC_AUTH_SCHEME } from '../../../../src/domain/services/sync/SyncAuthService.ts';
import SyncSecret from '../../../../src/domain/services/sync/SyncSecret.ts';
import FetchSyncHttpClientAdapter from '../../../../src/infrastructure/adapters/FetchSyncHttpClientAdapter.ts';
import defaultCrypto from '../../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import OperationPolicyPort from '../../../../src/ports/OperationPolicyPort.ts';
import type { SyncHttpClientTelemetry } from '../../../../src/ports/SyncHttpClientPort.ts';
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
