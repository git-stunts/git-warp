import { describe, it, expect } from 'vitest';
import HttpSyncServer from '../../../../src/domain/services/sync/HttpSyncServer.ts';
import type { HttpSyncServerOptions } from '../../../../src/domain/services/sync/HttpSyncServerHelpers.ts';
import type { SyncRequest, SyncResponse } from '../../../../src/domain/services/sync/SyncProtocol.ts';
import type LogFields from '../../../../src/domain/types/log/LogFields.ts';
import SyncSecret from '../../../../src/domain/services/sync/SyncSecret.ts';
import { HttpRequest } from '../../../../src/ports/HttpServerPort.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import NoOpLogger from '../../../../src/infrastructure/adapters/NoOpLogger.ts';
import ManualClock from '../../../helpers/ManualClock.ts';
import InMemorySyncReplayProtection from '../../../helpers/InMemorySyncReplayProtection.ts';
import { MemoryHttpPort, SyncInbox } from '../../../helpers/SyncHttpFixture.ts';

const BODY = new TextEncoder().encode('{"type":"sync-request","frontier":{}}');
function configured(options: Partial<HttpSyncServerOptions> = {}) {
  const http = new MemoryHttpPort();
  const graph = new SyncInbox();
  const server = new HttpSyncServer({ httpPort: http, graph, unsafeAllowUnauthenticatedLocalhost: true, ...options });
  return { http, graph, server };
}
function authentication() {
  const clock = new ManualClock();
  return { keys: { default: SyncSecret.fromString('secret') }, crypto: new NodeCryptoAdapter(), clock,
    replayProtection: new InMemorySyncReplayProtection(clock.read) };
}
class FailingSyncInbox extends SyncInbox {
  readonly failure = new Error('private object-store failure');
  override processSyncRequest(_request: SyncRequest): Promise<SyncResponse> { return Promise.reject(this.failure); }
}
class ErrorLog extends NoOpLogger {
  readonly entries: { message: string; context: LogFields | undefined }[] = [];
  override error(message: string, context?: LogFields): void { this.entries.push({ message, context }); }
}
class OrderedResponseInbox extends SyncInbox {
  override processSyncRequest(_request: SyncRequest): Promise<SyncResponse> {
    return Promise.resolve({ type: 'sync-response', frontier: { b: '2', a: '1' }, patches: [] });
  }
}

describe('HttpSyncServer configuration', () => {
  it('refuses a nonnumeric port', async () => {
    const { server } = configured();
    // @ts-expect-error Exercise runtime validation for an untyped caller.
    await expect(server.listen('abc')).rejects.toMatchObject({ code: 'E_SYNC_PROTOCOL' });
  });
  it('returns the configured URL and a usable close handle', async () => {
    const { server } = configured();
    const handle = await server.listen(9999);
    expect(handle.url).toBe('http://127.0.0.1:9999/sync');
    await handle.close();
  });
  it('requires explicit unsafe mode for localhost without auth', () => {
    expect(() => new HttpSyncServer({ httpPort: new MemoryHttpPort(), graph: new SyncInbox() }))
      .toThrow(/unsafeAllowUnauthenticatedLocalhost/);
  });
  it('allows explicit unsafe localhost mode', () => { expect(() => configured()).not.toThrow(); });
  it('requires auth for a nonlocal host even in unsafe mode', () => {
    expect(() => configured({ host: '0.0.0.0' })).toThrow(/auth is required for non-local sync hosts/);
  });
  it('refuses log-only auth on a nonlocal host', () => {
    expect(() => configured({ host: '0.0.0.0', auth: { ...authentication(), mode: 'log-only' } }))
      .toThrow(/non-local sync hosts require auth.mode "enforce"/);
  });
  it('allows enforced auth with rate limiting on a nonlocal host', () => {
    const clock = new ManualClock();
    expect(() => configured({ host: '0.0.0.0', auth: { ...authentication(), mode: 'enforce',
      rateLimit: { capacity: 1, refillTokensPerSecond: 1, clock: clock.read } } })).not.toThrow();
  });
  it('requires rate limiting on a nonlocal host', () => {
    expect(() => configured({ host: '0.0.0.0', auth: { ...authentication(), mode: 'enforce' } }))
      .toThrow(/non-local sync hosts require auth.rateLimit/);
  });
  it('rejects a path without a leading slash', () => { expect(() => configured({ path: 'sync' })).toThrow(/HttpSyncServer config/); });
  it('requires auth when allowedWriters is configured', () => {
    expect(() => configured({ allowedWriters: ['alice'] })).toThrow(/allowedWriters/);
  });
  it('accepts allowedWriters with authentication', () => {
    expect(() => configured({ auth: authentication(), allowedWriters: ['alice'] })).not.toThrow();
  });
  it('rejects missing required options', () => {
    // @ts-expect-error Exercise the untyped constructor boundary.
    expect(() => new HttpSyncServer({})).toThrow(/HttpSyncServer config/);
  });
  it('rejects a negative body size limit', () => { expect(() => configured({ maxRequestBytes: -1 })).toThrow(/HttpSyncServer config/); });
  it('rejects an empty key map', () => {
    expect(() => configured({ auth: { ...authentication(), keys: {} } })).toThrow(/auth.keys must not be empty/);
  });
  it('rejects unrecognized top-level options', () => {
    // @ts-expect-error Exercise strict runtime option validation.
    expect(() => configured({ unrecognized: 42 })).toThrow(/HttpSyncServer config/);
  });
  it('applies the default route and host', async () => {
    const { server, http } = configured();
    expect((await server.listen(9999)).url).toBe('http://127.0.0.1:9999/sync');
    expect(await http.request()).toMatchObject({ status: 200 });
  });
});

describe('HttpSyncServer HTTP boundary', () => {
  it.each([
    { name: 'non-JSON content type', method: 'POST', url: '/sync', contentType: 'text/plain', body: BODY, status: 400, error: 'Expected application/json' },
    { name: 'invalid URL', method: 'POST', url: 'http://[', contentType: 'application/json', body: BODY, status: 400, error: 'Invalid URL' },
    { name: 'wrong path', method: 'POST', url: '/missing', contentType: 'application/json', body: BODY, status: 404, error: 'Not Found' },
    { name: 'non-POST method', method: 'GET', url: '/sync', contentType: 'application/json', body: BODY, status: 405, error: 'Method Not Allowed' },
    { name: 'invalid JSON', method: 'POST', url: '/sync', contentType: 'application/json', body: new TextEncoder().encode('not-json'), status: 400, error: 'Invalid JSON' },
  ])('rejects $name before graph work', async row => {
    const { server, http, graph } = configured();
    await server.listen(9999);
    const result = await http.dispatch(new HttpRequest({ method: row.method, url: row.url, body: row.body,
      headers: { 'content-type': row.contentType, host: '127.0.0.1:9999' } }));
    expect(result).toMatchObject({ status: row.status, body: `{"error":"${row.error}"}` });
    expect(graph.requests).toHaveLength(0);
  });
  it('rejects an oversized request before graph work', async () => {
    const { server, http, graph } = configured({ maxRequestBytes: 10 });
    await server.listen(9999);
    expect(await http.request()).toMatchObject({ status: 413, body: '{"error":"Request too large"}' });
    expect(graph.requests).toHaveLength(0);
  });
  it.each([
    ['invalid request kind', '{"type":"not-sync"}'],
    ['array frontier', '{"type":"sync-request","frontier":[]}'],
    ['missing frontier', '{"type":"sync-request"}'],
    ['empty body', ''],
  ])('rejects %s before graph work', async (_name, source) => {
    const { server, http, graph } = configured();
    await server.listen(9999);
    const response = await http.request({}, new TextEncoder().encode(source));
    expect(response.status).toBe(400);
    expect(response.body).toContain('Invalid sync request');
    expect(graph.requests).toHaveLength(0);
  });
  it('returns a canonically ordered response', async () => {
    const { server, http } = configured({ graph: new OrderedResponseInbox() });
    await server.listen(9999);
    expect(await http.request()).toMatchObject({ status: 200, body: '{"frontier":{"a":"1","b":"2"},"patches":[],"type":"sync-response"}' });
  });
  it('sanitizes internal failures in HTTP responses', async () => {
    const { server, http } = configured({ graph: new FailingSyncInbox() });
    await server.listen(9999);
    expect(await http.request()).toMatchObject({ status: 500, body: '{"code":"E_SYNC_INTERNAL","error":"Sync failed"}' });
  });
  it('retains internal failure diagnostics in the logger', async () => {
    const graph = new FailingSyncInbox();
    const logger = new ErrorLog();
    const { server, http } = configured({ graph, logger });
    await server.listen(9999);
    expect(await http.request()).toMatchObject({ status: 500 });
    expect(logger.entries).toEqual([{ message: 'sync server: processSyncRequest failed', context: { error: graph.failure } }]);
  });
  it('allows an omitted content-type header', async () => {
    const { server, http } = configured();
    await server.listen(9999);
    expect(await http.dispatch(new HttpRequest({ method: 'POST', url: '/sync', headers: { host: '127.0.0.1:9999' }, body: BODY })))
      .toMatchObject({ status: 200 });
  });
  it('allows application/json with a charset', async () => {
    const { server, http } = configured();
    await server.listen(9999);
    expect(await http.request({ 'content-type': 'application/json; charset=utf-8' })).toMatchObject({ status: 200 });
  });
});
