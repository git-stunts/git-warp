import { describe, expect, it } from 'vitest';
import HttpSyncServer from '../../../../src/domain/services/sync/HttpSyncServer.ts';
import { signSyncRequest } from '../../../../src/domain/services/sync/SyncAuthService.ts';
import SyncSecret from '../../../../src/domain/services/sync/SyncSecret.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import ManualClock from '../../../helpers/ManualClock.ts';
import InMemorySyncReplayProtection from '../../../helpers/InMemorySyncReplayProtection.ts';
import SeededRandomPort from '../../../helpers/SeededRandomPort.ts';
import { MemoryHttpPort, SyncInbox } from '../../../helpers/SyncHttpFixture.ts';

const SECRET = SyncSecret.fromString('writer-boundary-secret');
const CRYPTO = new NodeCryptoAdapter();
const ACCEPTED = '{"frontier":{},"patches":[],"type":"sync-response"}';
const FORBIDDEN = '{"error":"FORBIDDEN_WRITER"}';

describe('HttpSyncServer frontier writer authorization', () => {
  it.each([
    { name: 'listed frontier writer', frontier: '"alice":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"', status: 200, response: ACCEPTED, received: 1 },
    { name: 'empty frontier', frontier: '', status: 200, response: ACCEPTED, received: 1 },
    { name: 'forbidden frontier writer', frontier: '"eve":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"', status: 403, response: FORBIDDEN, received: 0 },
    { name: 'allowed then forbidden writer', frontier: '"alice":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","eve":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"', status: 403, response: FORBIDDEN, received: 0 },
    { name: 'forbidden then allowed writer', frontier: '"eve":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","alice":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"', status: 403, response: FORBIDDEN, received: 0 },
    { name: 'two listed frontier writers', frontier: '"alice":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","bob":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"', status: 200, response: ACCEPTED, received: 1 },
  ])('handles a $name through the signed HTTP boundary', async row => {
    const clock = new ManualClock();
    const http = new MemoryHttpPort();
    const graph = new SyncInbox();
    const server = new HttpSyncServer({ httpPort: http, graph, clock, allowedWriters: ['alice', 'bob'],
      auth: { keys: { default: SECRET }, crypto: CRYPTO, clock,
        replayProtection: new InMemorySyncReplayProtection(clock.read) } });
    await server.listen(9999);
    const body = new TextEncoder().encode(`{"type":"sync-request","frontier":{${row.frontier}}}`);
    const headers = await signSyncRequest({ method: 'POST', path: '/sync', contentType: 'application/json', body,
      secret: SECRET, keyId: 'default' }, { crypto: CRYPTO, clock, random: new SeededRandomPort(1089) });
    expect(await http.request(headers, body)).toMatchObject({
      status: row.status,
      body: row.response,
    });
    expect(graph.requests).toHaveLength(row.received);
  });
});
