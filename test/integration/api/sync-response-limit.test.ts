import { describe, expect, it } from 'vitest';
import NodeHttpAdapter from '../../../src/infrastructure/adapters/NodeHttpAdapter.ts';
import InMemoryGraphAdapter from '../../helpers/InMemoryGraphAdapter.ts';
import ManualClock from '../../helpers/ManualClock.ts';
import SeededRandomPort from '../../helpers/SeededRandomPort.ts';
import { openMemoryRuntimeHostProduct } from '../../helpers/MemoryRuntimeHost.ts';

const GRAPH = 'response-limit';
const WRITERS = ['alice', 'bob', 'carol'];
const PATCHES_PER_WRITER = 40;
const NODES_PER_PATCH = 10;
const PROPERTIES_PER_PATCH = 30;
const VALUE = 'v'.repeat(1024);
/**
 * A floor that keeps this an honest multi-megabyte response. #1135 measured
 * 4,511,916 bytes for 120 patches of thirty 1 KiB values and ten edges; this
 * shape has no edges.
 */
const HONEST_RESPONSE_FLOOR_BYTES = 4_000_000;

/** One repository and the one clock that every runtime opened on it shares. */
type History = { readonly persistence: InMemoryGraphAdapter; readonly clock: ManualClock };

function newHistory(): History {
  return { persistence: new InMemoryGraphAdapter(), clock: new ManualClock() };
}

async function openWriter(history: History, writerId: string, seed: number) {
  return await openMemoryRuntimeHostProduct({ persistence: history.persistence, clock: history.clock,
    graphName: GRAPH, writerId, random: new SeededRandomPort(seed) });
}

async function writeHistory(history: History): Promise<void> {
  for (const [index, writerId] of WRITERS.entries()) {
    const writer = await openWriter(history, writerId, 1135 + index);
    for (let patchIndex = 0; patchIndex < PATCHES_PER_WRITER; patchIndex += 1) {
      const patch = await writer.createPatch();
      for (let property = 0; property < PROPERTIES_PER_PATCH; property += 1) {
        const node = `${writerId}:${patchIndex}:${property % NODES_PER_PATCH}`;
        if (property < NODES_PER_PATCH) { patch.addNode(node); }
        patch.setProperty(node, `field${Math.floor(property / NODES_PER_PATCH)}`, VALUE);
      }
      await patch.commit();
    }
  }
}

describe('sync response limit through serve() and a real socket', () => {
  // Oracle: #1135. The default limit is 512 MiB, far above this honest
  // multi-megabyte history, so the bounded client applies every patch. The
  // Node server sends this body chunked, with no Content-Length, so the
  // client counts the streamed bytes; Bun's node:http server sends a
  // Content-Length, so the client also checks the header.
  it('syncs an honest multi-megabyte history through the bounded client', async () => {
    const serverHistory = newHistory();
    await writeHistory(serverHistory);
    const server = await openWriter(serverHistory, 'alice', 1135);
    const handle = await server.serve({ port: 0, httpPort: new NodeHttpAdapter(), unsafeAllowUnauthenticatedLocalhost: true });
    try {
      const probe = await fetch(handle.url, { method: 'POST', body: '{"type":"sync-request","frontier":{}}',
        headers: { 'content-type': 'application/json' } });
      const wireBytes = (await probe.arrayBuffer()).byteLength;
      expect(wireBytes).toBeGreaterThan(HONEST_RESPONSE_FLOOR_BYTES);

      const client = await openWriter(newHistory(), 'dave', 2135);
      const result = await client.syncWith(handle.url, { materialize: true });

      expect(result.applied).toBe(WRITERS.length * PATCHES_PER_WRITER);
    } finally {
      await handle.close();
    }
  });
});
