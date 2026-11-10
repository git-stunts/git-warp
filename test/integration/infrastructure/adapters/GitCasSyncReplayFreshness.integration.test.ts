import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ContentAddressableStore from '@git-stunts/git-cas';
import Plumbing from '@git-stunts/plumbing';
import HttpSyncServer from '../../../../src/domain/services/sync/HttpSyncServer.ts';
import { signSyncRequest, SYNC_CLOCK_SKEW_ALLOWANCE_MS } from '../../../../src/domain/services/sync/SyncAuthService.ts';
import SyncSecret from '../../../../src/domain/services/sync/SyncSecret.ts';
import GitCasSyncReplayProtectionAdapter from '../../../../src/infrastructure/adapters/GitCasSyncReplayProtectionAdapter.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import CallLatch from '../../../helpers/CallLatch.ts';
import ManualClock, { MANUAL_CLOCK_EPOCH_MS } from '../../../helpers/ManualClock.ts';
import SeededRandomPort from '../../../helpers/SeededRandomPort.ts';
import SyncReplaySweepGate from '../../../helpers/SyncReplaySweepGate.ts';
import { MemoryHttpPort, SyncInbox } from '../../../helpers/SyncHttpFixture.ts';

const BODY = new TextEncoder().encode('{"type":"sync-request","frontier":{}}');
const SECRET = SyncSecret.fromString('replay-sweep-boundary-secret');
const CRYPTO = new NodeCryptoAdapter();
const stores: ContentAddressableStore[] = [];
const directories: string[] = [];
const latches: CallLatch[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(MANUAL_CLOCK_EPOCH_MS);
});

afterEach(async () => {
  for (const latch of latches.splice(0)) { latch.release(); }
  await Promise.all(stores.splice(0).map(async store => await store.close()));
  await Promise.all(directories.splice(0).map(async directory => {
    await rm(directory, { recursive: true, force: true });
  }));
  vi.useRealTimers();
});

async function createRepository(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'git-warp-replay-sweep-'));
  directories.push(directory);
  const plumbing = await Plumbing.createDefault({ cwd: directory });
  await plumbing.execute({ args: ['init', '-q'] });
  await plumbing.execute({ args: ['config', 'user.email', 'test@test.com'] });
  await plumbing.execute({ args: ['config', 'user.name', 'Test'] });
  return directory;
}

/** `host` leaves the adapter on its default clock, which the fake system `Date` drives. */
type StoreTime = 'injected' | 'host';

async function openServer(directory: string, clock: ManualClock, graph: SyncInbox, latch?: CallLatch, storeTime: StoreTime = 'injected') {
  const plumbing = await Plumbing.createDefault({ cwd: directory });
  const store = ContentAddressableStore.createCbor({ plumbing, chunking: { strategy: 'cdc' } });
  stores.push(store);
  const gates: SyncReplaySweepGate[] = [];
  const replay = new GitCasSyncReplayProtectionAdapter({
    graphName: 'events', ...(storeTime === 'injected' ? { wallClockMs: clock.read } : {}),
    cas: { expiringSets: { open: async options => {
      const set = await store.expiringSets.open(options);
      if (latch === undefined) { return set; }
      const gate = new SyncReplaySweepGate(set, latch);
      gates.push(gate);
      return gate;
    } } },
  });
  const http = new MemoryHttpPort();
  const server = new HttpSyncServer({ httpPort: http, graph,
    auth: { keys: { default: SECRET }, crypto: CRYPTO, clock, replayProtection: replay } });
  await server.listen(9999);
  return { store, replay, http, gates };
}

async function signed(clock: ManualClock, seed: number) {
  return await signSyncRequest({ method: 'POST', path: '/sync', contentType: 'application/json',
    body: BODY, secret: SECRET, keyId: 'default' }, { crypto: CRYPTO, random: new SeededRandomPort(seed), clock });
}

describe('durable replay freshness while storage awaits', () => {
  // Oracle: one captured request reaches graph sync at most once, even when time
  // advances through the durable marker's expiry during the real sweep await.
  it.each([
    { name: 'no time advancement', advanceMs: 0, removed: 0, admitted: false,
      response: '{"error":"REPLAY"}' },
    { name: 'one millisecond crosses expiry', advanceMs: 1, removed: 1, admitted: true,
      response: '{"error":"EXPIRED"}' },
  ])('refuses the captured request after restart: $name', async row => {
    const directory = await createRepository();
    const clock = new ManualClock();
    const graph = new SyncInbox();
    const headers = await signed(new ManualClock(clock.nowMs() + SYNC_CLOCK_SKEW_ALLOWANCE_MS), 1089);
    const first = await openServer(directory, clock, graph);
    expect((await first.http.request(headers, BODY)).status).toBe(200);
    expect(graph.requests).toHaveLength(1);
    await first.store.close();
    stores.splice(stores.indexOf(first.store), 1);

    clock.advance(2 * SYNC_CLOCK_SKEW_ALLOWANCE_MS);
    vi.setSystemTime(clock.nowMs());
    const latch = new CallLatch('before');
    latches.push(latch);
    const restarted = await openServer(directory, clock, graph, latch);
    const response = restarted.http.request(headers, BODY);
    try {
      expect(await Promise.race([
        latch.arrived().then(() => 'sweep entered'), response.then(() => 'request completed'),
      ])).toBe('sweep entered');
      expect(graph.requests).toHaveLength(1);
      clock.advance(row.advanceMs);
      vi.setSystemTime(clock.nowMs());
    } finally {
      latch.release();
      await response;
    }
    const result = await response;
    expect(restarted.gates).toHaveLength(1);
    expect(restarted.gates[0]?.sweeps.map(sweep => sweep.removed)).toEqual([row.removed]);
    expect(restarted.gates[0]?.admissions.map(admission => admission.admitted)).toEqual([row.admitted]);
    const outcome = { status: result.status, body: result.body, graphRequests: graph.requests.length };
    expect(outcome).toEqual({ status: 403, body: row.response, graphRequests: 1 });
  });

  it('refuses an already expired captured request before entering storage', async () => {
    const directory = await createRepository();
    const clock = new ManualClock();
    const graph = new SyncInbox();
    const headers = await signed(new ManualClock(clock.nowMs() + SYNC_CLOCK_SKEW_ALLOWANCE_MS), 1089);
    const first = await openServer(directory, clock, graph);
    expect((await first.http.request(headers, BODY)).status).toBe(200);
    await first.store.close();
    stores.splice(stores.indexOf(first.store), 1);
    clock.advance(2 * SYNC_CLOCK_SKEW_ALLOWANCE_MS + 1);
    vi.setSystemTime(clock.nowMs());
    const latch = new CallLatch('before');
    latches.push(latch);
    const restarted = await openServer(directory, clock, graph, latch);
    expect(await restarted.http.request(headers, BODY)).toMatchObject({ status: 403, body: '{"error":"EXPIRED"}' });
    expect(graph.requests).toHaveLength(1);
    expect(restarted.gates.flatMap(gate => gate.sweeps)).toEqual([]);
    expect(restarted.gates.flatMap(gate => gate.admissions)).toEqual([]);
    latch.release();
    expect(await restarted.replay.sweep()).toMatchObject({ removed: 1 });
  });

  it('admits an independently signed fresh nonce after the old marker expires', async () => {
    const directory = await createRepository();
    const clock = new ManualClock();
    const graph = new SyncInbox();
    const first = await openServer(directory, clock, graph);
    expect((await first.http.request(await signed(clock, 1089), BODY)).status).toBe(200);
    await first.store.close();
    stores.splice(stores.indexOf(first.store), 1);
    clock.advance(2 * SYNC_CLOCK_SKEW_ALLOWANCE_MS + 1);
    vi.setSystemTime(clock.nowMs());
    const restarted = await openServer(directory, clock, graph);
    expect(await restarted.http.request(await signed(clock, 1090), BODY)).toMatchObject({
      status: 200, body: '{"frontier":{},"patches":[],"type":"sync-response"}',
    });
    expect(graph.requests).toHaveLength(2);
  });

  // Oracle (#1089 F-1): the replay store's time decides the final freshness verdict, so an
  // injected runtime clock that stands still cannot let a captured request in twice.
  it('refuses the captured request when the injected clock stands still past marker expiry', async () => {
    const directory = await createRepository();
    const clock = new ManualClock();
    const graph = new SyncInbox();
    const headers = await signed(clock, 1089);
    const first = await openServer(directory, clock, graph, undefined, 'host');
    expect((await first.http.request(headers, BODY)).status).toBe(200);
    await first.store.close();
    stores.splice(stores.indexOf(first.store), 1);

    vi.setSystemTime(MANUAL_CLOCK_EPOCH_MS + 2 * SYNC_CLOCK_SKEW_ALLOWANCE_MS + 1);
    const restarted = await openServer(directory, clock, graph, undefined, 'host');
    const result = await restarted.http.request(headers, BODY);
    const outcome = { status: result.status, body: result.body, graphRequests: graph.requests.length };
    expect(outcome).toEqual({ status: 403, body: '{"error":"EXPIRED"}', graphRequests: 1 });
  });

  // Oracle: the duplicate enters storage one millisecond before the marker expires and the
  // store crosses expiry during the sweep. The store admits the nonce again; the store-time
  // reading taken after admission still refuses the request. The first admission is the
  // control: a request signed exactly at the future bound is accepted.
  it('refuses a duplicate whose storage wait crosses marker expiry under a stopped injected clock', async () => {
    const directory = await createRepository();
    const clock = new ManualClock();
    const graph = new SyncInbox();
    const headers = await signed(new ManualClock(clock.nowMs() + SYNC_CLOCK_SKEW_ALLOWANCE_MS), 1089);
    const first = await openServer(directory, clock, graph, undefined, 'host');
    expect((await first.http.request(headers, BODY)).status).toBe(200);
    expect(graph.requests).toHaveLength(1);
    await first.store.close();
    stores.splice(stores.indexOf(first.store), 1);

    vi.setSystemTime(MANUAL_CLOCK_EPOCH_MS + 2 * SYNC_CLOCK_SKEW_ALLOWANCE_MS);
    const latch = new CallLatch('before');
    latches.push(latch);
    const restarted = await openServer(directory, clock, graph, latch, 'host');
    const response = restarted.http.request(headers, BODY);
    try {
      await latch.arrived();
      vi.setSystemTime(MANUAL_CLOCK_EPOCH_MS + 2 * SYNC_CLOCK_SKEW_ALLOWANCE_MS + 1);
    } finally {
      latch.release();
      await response;
    }
    const result = await response;
    expect(restarted.gates[0]?.sweeps.map(sweep => sweep.removed)).toEqual([1]);
    expect(restarted.gates[0]?.admissions.map(admission => admission.admitted)).toEqual([true]);
    const outcome = { status: result.status, body: result.body, graphRequests: graph.requests.length };
    expect(outcome).toEqual({ status: 403, body: '{"error":"EXPIRED"}', graphRequests: 1 });
  });

  // Oracle: the entry reading sets the marker expiry; the completion reading comes from
  // the same clock after the store has answered.
  it('reports the store time on entry and after the store answers', async () => {
    const directory = await createRepository();
    const latch = new CallLatch('before');
    latches.push(latch);
    const server = await openServer(directory, new ManualClock(), new SyncInbox(), latch, 'host');
    const pending = server.replay.reserve({ keyId: 'default', nonce: 'store-time-readings', ttlMs: 60_000 });
    try {
      await latch.arrived();
      vi.setSystemTime(MANUAL_CLOCK_EPOCH_MS + 7);
    } finally {
      latch.release();
      await pending;
    }
    expect(await pending).toEqual({
      admitted: true,
      expiresAt: new Date(MANUAL_CLOCK_EPOCH_MS + 60_000).toISOString(),
      generation: expect.stringMatching(/^[0-9a-f]{40,64}$/),
      reservedAtMs: MANUAL_CLOCK_EPOCH_MS,
      completedAtMs: MANUAL_CLOCK_EPOCH_MS + 7,
    });
  });
});
