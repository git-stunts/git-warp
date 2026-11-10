import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import HttpSyncServer from '../../src/domain/services/sync/HttpSyncServer.ts';
import { DEFAULT_MAX_REQUEST_BYTES } from '../../src/domain/services/sync/HttpSyncServerHelpers.ts';
import { signSyncRequest } from '../../src/domain/services/sync/SyncAuthService.ts';
import type { SyncPeerRateLimit } from '../../src/domain/services/sync/SyncPeerRateLimiter.ts';
import SyncSecret from '../../src/domain/services/sync/SyncSecret.ts';
import NodeCryptoAdapter from '../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import InMemorySyncReplayProtection from '../helpers/InMemorySyncReplayProtection.ts';
import ManualClock from '../helpers/ManualClock.ts';
import SeededRandomPort from '../helpers/SeededRandomPort.ts';
import { MemoryHttpPort, SyncInbox } from '../helpers/SyncHttpFixture.ts';
import { logEnvironment } from './benchmarkUtils.ts';

// Measures what one rejected sync request costs the server, as the basis for
// DEFAULT_SYNC_PEER_RATE_LIMIT (issue #1090). The assertions are positive
// controls on status codes only; no assertion reads a timing.
const SECRET = SyncSecret.fromString('rejection-cost-secret');
const WRONG_SECRET = SyncSecret.fromString('rejection-cost-wrong-secret');
const CRYPTO = new NodeCryptoAdapter();
const RANDOM = new SeededRandomPort(1090);
const UNLIMITED: SyncPeerRateLimit = { capacity: 1_000_000, refillTokensPerSecond: 1_000_000, maxTrackedPeers: 16 };
const SPENT: SyncPeerRateLimit = { capacity: 1, refillTokensPerSecond: 0.000001, maxTrackedPeers: 16 };
const MAX_FRONTIER_WRITERS = 10_000;
const MAX_WRITER_ID_BYTES = 256;
const ENTRY_BYTES = 416;
const ENTRY_PUNCTUATION_BYTES = 6;
const WARMUP_RUNS = 5;
const SIZES = [
  { label: 'small', bytes: 0, runs: 300 },
  { label: '64 KiB', bytes: 64 * 1024, runs: 300 },
  { label: 'maximum (4 MiB)', bytes: DEFAULT_MAX_REQUEST_BYTES, runs: 40 },
];

/** A valid sync request whose frontier fills `targetBytes` with real JSON structure. */
function syncRequestBody(targetBytes: number): Uint8Array {
  const writers = Math.min(MAX_FRONTIER_WRITERS, Math.floor(targetBytes / ENTRY_BYTES));
  const perEntry = writers === 0 ? 0 : Math.floor(targetBytes / writers) - ENTRY_PUNCTUATION_BYTES;
  const idBytes = Math.min(MAX_WRITER_ID_BYTES, Math.floor(perEntry / 2));
  const entries = Array.from({ length: writers }, (_, index) =>
    `"${String(index).padStart(idBytes, 'w')}":"${'a'.repeat(perEntry - idBytes)}"`);
  return new TextEncoder().encode(`{"type":"sync-request","frontier":{${entries.join(',')}}}`);
}

/** The same bytes with the final brace removed, so the parser reads the whole body and then fails. */
function malformed(body: Uint8Array): Uint8Array {
  return body.subarray(0, body.length - 1);
}

async function boot(peerRateLimit: SyncPeerRateLimit) {
  const clock = new ManualClock();
  const http = new MemoryHttpPort();
  const server = new HttpSyncServer({ httpPort: http, graph: new SyncInbox(), clock, peerRateLimit,
    auth: { keys: { default: SECRET }, crypto: CRYPTO, clock,
      replayProtection: new InMemorySyncReplayProtection(clock.read) } });
  await server.listen(9999);
  return { clock, http };
}

async function signed(clock: ManualClock, body: Uint8Array, key: { secret: SyncSecret; keyId: string }) {
  return await signSyncRequest({ method: 'POST', path: '/sync', contentType: 'application/json', body, ...key },
    { crypto: CRYPTO, random: RANDOM, clock });
}

type Cost = { readonly wallMs: number[]; readonly cpuMs: number[]; readonly statuses: Set<number | undefined> };

async function measure(runs: number, request: () => Promise<{ status?: number | undefined }>): Promise<Cost> {
  const cost: Cost = { wallMs: [], cpuMs: [], statuses: new Set() };
  for (let run = 0; run < WARMUP_RUNS + runs; run += 1) {
    const cpuStart = process.cpuUsage();
    const wallStart = performance.now();
    const response = await request();
    const wall = performance.now() - wallStart;
    const cpu = process.cpuUsage(cpuStart);
    cost.statuses.add(response.status);
    if (run >= WARMUP_RUNS) {
      cost.wallMs.push(wall);
      cost.cpuMs.push((cpu.user + cpu.system) / 1000);
    }
  }
  return cost;
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? Number.NaN;
}

function report(label: string, cost: Cost): void {
  const cell = (value: number): string => value.toFixed(3).padStart(9);
  const wall = [0, 0.5, 0.9, 0.99, 1].map((fraction) => cell(percentile(cost.wallMs, fraction))).join('');
  const cpu = [0.5, 0.99, 1].map((fraction) => cell(percentile(cost.cpuMs, fraction))).join('');
  console.log(`  ${label.padEnd(44)} n=${String(cost.wallMs.length).padEnd(4)} wall ms min/p50/p90/p99/max${wall}  cpu ms p50/p99/max${cpu}`);
}

describe('sync rejection cost', () => {
  it('logs the environment', () => {
    logEnvironment();
    expect(SIZES).toHaveLength(3);
  });

  it.each(SIZES)('measures each rejection class for a $label body', async ({ label, bytes, runs }) => {
    const body = syncRequestBody(bytes);
    const open = await boot(UNLIMITED);
    console.log(`\n  body: ${label}, ${body.length} bytes`);

    const accepted = await measure(runs, async () =>
      await open.http.request(await signed(open.clock, body, { secret: SECRET, keyId: 'default' }), body));
    expect([...accepted.statuses]).toEqual([200]);
    report('positive control: valid request (200)', accepted);

    const broken = malformed(body);
    const invalidJson = await measure(runs, async () => await open.http.request({}, broken));
    expect([...invalidJson.statuses]).toEqual([400]);
    report('malformed JSON (400)', invalidJson);

    const unknownKeyHeaders = await signed(open.clock, body, { secret: SECRET, keyId: 'missing' });
    const unknownKey = await measure(runs, async () => await open.http.request(unknownKeyHeaders, body));
    expect([...unknownKey.statuses]).toEqual([401]);
    report('unknown key-id (401)', unknownKey);

    const badSignatureHeaders = await signed(open.clock, body, { secret: WRONG_SECRET, keyId: 'default' });
    const badSignature = await measure(runs, async () => await open.http.request(badSignatureHeaders, body));
    expect([...badSignature.statuses]).toEqual([401]);
    report('known key-id, bad signature (401)', badSignature);

    const closed = await boot(SPENT);
    await closed.http.request(badSignatureHeaders, body);
    const refused = await measure(runs, async () => await closed.http.request(badSignatureHeaders, body));
    expect([...refused.statuses]).toEqual([429]);
    report('refused by the peer gate (429)', refused);
  });
});
