import { describe, it, expect } from 'vitest';
import HttpSyncServer from '../../../../src/domain/services/sync/HttpSyncServer.ts';
import { signSyncRequest, SYNC_CLOCK_SKEW_ALLOWANCE_MS } from '../../../../src/domain/services/sync/SyncAuthService.ts';
import type { HttpSyncServerOptions } from '../../../../src/domain/services/sync/HttpSyncServerHelpers.ts';
import SyncSecret from '../../../../src/domain/services/sync/SyncSecret.ts';
import defaultCrypto from '../../../../src/infrastructure/adapters/NodeCryptoSingleton.ts';
import SeededRandomPort from '../../../helpers/SeededRandomPort.ts';
import InMemorySyncReplayProtection from '../../../helpers/InMemorySyncReplayProtection.ts';
import ManualClock from '../../../helpers/ManualClock.ts';
import { MemoryHttpPort, SyncInbox, WarningLog } from '../../../helpers/SyncHttpFixture.ts';

const SECRET = SyncSecret.fromString('test-secret');
const KEYS = { default: SECRET };
const BODY = new TextEncoder().encode('{"type":"sync-request","frontier":{}}');
const FORBIDDEN_BODY = new TextEncoder().encode('{"type":"sync-request","frontier":{"eve":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}}');

async function signed(clock: ManualClock, options: { body?: Uint8Array; secret?: SyncSecret; keyId?: string } = {}) {
  return await signSyncRequest({ method: 'POST', path: '/sync', contentType: 'application/json',
    body: options.body ?? BODY, secret: options.secret ?? SECRET, keyId: options.keyId ?? 'default' },
  { crypto: defaultCrypto, random: new SeededRandomPort(clock.nowMs()), clock });
}
function auth(clock: ManualClock, mode: 'enforce' | 'log-only') {
  return { keys: KEYS, crypto: defaultCrypto, clock, mode,
    replayProtection: new InMemorySyncReplayProtection(clock.read) };
}
async function boot(options: Partial<HttpSyncServerOptions> = {}) {
  const clock = new ManualClock();
  const http = new MemoryHttpPort();
  const graph = new SyncInbox();
  const server = new HttpSyncServer({ httpPort: http, graph,
    auth: { keys: KEYS, crypto: defaultCrypto, clock,
      replayProtection: new InMemorySyncReplayProtection(clock.read) }, ...options });
  await server.listen(9999);
  return { clock, http, graph };
}

describe('HttpSyncServer authenticated admission', () => {
  it('rejects an unsigned request before graph work', async () => {
    const { http, graph } = await boot();
    expect(await http.request()).toMatchObject({ status: 400, body: '{"error":"INVALID_VERSION"}' });
    expect(graph.requests).toHaveLength(0);
  });
  it('rejects missing auth headers when the version is present', async () => {
    const { http, graph } = await boot();
    expect(await http.request({ 'x-warp-sig-version': '3' })).toMatchObject({ status: 401, body: '{"error":"MISSING_AUTH"}' });
    expect(graph.requests).toHaveLength(0);
  });
  it('admits a valid v3 request into graph sync', async () => {
    const { clock, http, graph } = await boot();
    expect(await http.request(await signed(clock))).toMatchObject({ status: 200, body: '{"frontier":{},"patches":[],"type":"sync-response"}' });
    expect(graph.requests).toEqual([{ type: 'sync-request', frontier: {} }]);
  });
  it('rejects a wrong signing secret', async () => {
    const { clock, http, graph } = await boot();
    expect(await http.request(await signed(clock, { secret: SyncSecret.fromString('wrong-secret') })))
      .toMatchObject({ status: 401, body: '{"error":"INVALID_SIGNATURE"}' });
    expect(graph.requests).toHaveLength(0);
  });
  it('rejects an already admitted nonce', async () => {
    const { clock, http, graph } = await boot();
    const headers = await signed(clock);
    expect(await http.request(headers)).toMatchObject({ status: 200 });
    expect(await http.request(headers)).toMatchObject({ status: 403, body: '{"error":"REPLAY"}' });
    expect(graph.requests).toHaveLength(1);
  });
  it('returns a stable 503 when replay storage is unavailable', async () => {
    const clock = new ManualClock();
    const { http, graph } = await boot({ auth: { ...auth(clock, 'enforce'), replayProtection: {
      reserve: () => Promise.reject(new Error('private adapter failure')),
      sweep: () => Promise.resolve({ removed: 0, generation: null }),
    } } });
    expect(await http.request(await signed(clock))).toMatchObject({ status: 503, body: '{"error":"REPLAY_STORE_UNAVAILABLE"}' });
    expect(graph.requests).toHaveLength(0);
  });
  it('rejects a signed timestamp outside the skew allowance', async () => {
    const { clock, http, graph } = await boot();
    const old = new ManualClock(clock.nowMs() - SYNC_CLOCK_SKEW_ALLOWANCE_MS - 1);
    expect(await http.request(await signed(old))).toMatchObject({ status: 403, body: '{"error":"EXPIRED"}' });
    expect(graph.requests).toHaveLength(0);
  });
  it('refuses signature v2 with SIG_VERSION_RETIRED', async () => {
    const { clock, http, graph } = await boot();
    const headers = { ...await signed(clock), 'x-warp-sig-version': '2' };
    expect(await http.request(headers)).toMatchObject({ status: 400, body: '{"error":"SIG_VERSION_RETIRED"}' });
    expect(graph.requests).toHaveLength(0);
  });
  it('rejects an unconfigured key-id', async () => {
    const { clock, http, graph } = await boot();
    expect(await http.request(await signed(clock, { keyId: 'missing' }))).toMatchObject({ status: 401, body: '{"error":"UNKNOWN_KEY_ID"}' });
    expect(graph.requests).toHaveLength(0);
  });
  it('defaults an omitted auth mode to enforce', async () => {
    const { http, graph } = await boot();
    expect(await http.request()).toMatchObject({ status: 400 });
    expect(graph.requests).toHaveLength(0);
  });
  it('rejects an invalid auth mode at construction', () => {
    const clock = new ManualClock();
    expect(() => new HttpSyncServer({ httpPort: new MemoryHttpPort(), graph: new SyncInbox(),
      // @ts-expect-error Exercise an untyped caller with an invalid mode.
      auth: { ...auth(clock, 'enforce'), mode: 'typo' } })).toThrow(/HttpSyncServer config/);
  });
  it.each([null, undefined, {}, 0])('rejects an invalid clock port at construction: %s', invalidClock => {
    const clock = new ManualClock();
    expect(() => new HttpSyncServer({ httpPort: new MemoryHttpPort(), graph: new SyncInbox(),
      // @ts-expect-error Exercise malformed clock input at the HTTP configuration boundary.
      auth: { ...auth(clock, 'enforce'), clock: invalidClock } })).toThrow(/HttpSyncServer config/);
  });
  it.each(['signed', 'unsigned'])('rejects oversized %s input before graph work', async mode => {
    const { clock, http, graph } = await boot({ maxRequestBytes: 10 });
    const headers = mode === 'signed' ? await signed(clock) : {};
    expect(await http.request(headers)).toMatchObject({ status: 413 });
    expect(graph.requests).toHaveLength(0);
  });
  it('blocks a forbidden writer in enforce mode', async () => {
    const { clock, http, graph } = await boot({ allowedWriters: ['alice'] });
    const headers = await signed(clock, { body: FORBIDDEN_BODY });
    expect(await http.request(headers, FORBIDDEN_BODY)).toMatchObject({ status: 403, body: '{"error":"FORBIDDEN_WRITER"}' });
    expect(graph.requests).toHaveLength(0);
  });
  it('rejects an exhausted request budget before graph work', async () => {
    const clock = new ManualClock();
    const { http, graph } = await boot({ auth: { ...auth(clock, 'enforce'),
      rateLimit: { capacity: 1, refillTokensPerSecond: 1, clock: clock.read } } });
    expect(await http.request(await signed(clock))).toMatchObject({ status: 200 });
    clock.advance(1);
    expect(await http.request(await signed(clock))).toMatchObject({ status: 429, body: '{"error":"RATE_LIMITED"}' });
    expect(graph.requests).toHaveLength(1);
  });
});

describe('HttpSyncServer explicitly permissive operation', () => {
  it('processes unsigned requests in log-only mode', async () => {
    const { http, graph } = await boot({ auth: auth(new ManualClock(), 'log-only') });
    expect(await http.request()).toMatchObject({ status: 200 });
    expect(graph.requests).toEqual([{ type: 'sync-request', frontier: {} }]);
  });
  it('processes invalid signatures in log-only mode', async () => {
    const clock = new ManualClock();
    const { http, graph } = await boot({ auth: auth(clock, 'log-only') });
    const headers = await signed(clock, { secret: SyncSecret.fromString('wrong-secret') });
    expect(await http.request(headers)).toMatchObject({ status: 200 });
    expect(graph.requests).toHaveLength(1);
  });
  it('processes retired signature versions in explicit log-only mode', async () => {
    const clock = new ManualClock();
    const { http, graph } = await boot({ auth: auth(clock, 'log-only') });
    const headers = { ...await signed(clock), 'x-warp-sig-version': '2' };
    expect(await http.request(headers)).toMatchObject({ status: 200 });
    expect(graph.requests).toHaveLength(1);
  });
  it('processes forbidden writers in log-only mode', async () => {
    const clock = new ManualClock();
    const { http, graph } = await boot({ auth: auth(clock, 'log-only'), allowedWriters: ['alice'] });
    const headers = await signed(clock, { body: FORBIDDEN_BODY });
    expect(await http.request(headers, FORBIDDEN_BODY)).toMatchObject({ status: 200 });
    expect(graph.requests).toHaveLength(1);
  });
  it('records both failures when log-only mode admits a request', async () => {
    const clock = new ManualClock();
    const logger = new WarningLog();
    const { http, graph } = await boot({ auth: { ...auth(clock, 'log-only'), logger }, allowedWriters: ['alice'] });
    const headers = await signed(clock, { body: FORBIDDEN_BODY, secret: SyncSecret.fromString('wrong-secret') });
    expect(await http.request(headers, FORBIDDEN_BODY)).toMatchObject({ status: 200 });
    expect(graph.requests).toHaveLength(1);
    expect(logger.warnings).toEqual(['sync auth: signature mismatch', 'sync auth: forbidden writers rejected']);
  });
  it.each(['signed', 'unsigned'])('admits a %s request with explicit unsafe localhost mode', async mode => {
    const http = new MemoryHttpPort();
    const graph = new SyncInbox();
    const server = new HttpSyncServer({ httpPort: http, graph, unsafeAllowUnauthenticatedLocalhost: true });
    await server.listen(9999);
    const headers = mode === 'signed' ? await signed(new ManualClock()) : {};
    expect(await http.request(headers)).toMatchObject({ status: 200 });
    expect(graph.requests).toEqual([{ type: 'sync-request', frontier: {} }]);
  });
});
