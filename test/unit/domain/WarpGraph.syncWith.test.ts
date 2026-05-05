import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createServer } from 'node:http';
import { openRuntimeHostProduct } from '../../../src/domain/warp/RuntimeHostProduct.ts';

async function createGraph() {
  const mockPersistence = {
    readRef: vi.fn().mockResolvedValue(null),
    listRefs: vi.fn().mockResolvedValue([]),
    updateRef: vi.fn().mockResolvedValue(undefined),
    configGet: vi.fn().mockResolvedValue(null),
    configSet: vi.fn().mockResolvedValue(undefined),
    readBlob: vi.fn(),
    writeBlob: vi.fn(),
    getNodeInfo: vi.fn(),
    readTreeOids: vi.fn(),
    writeTree: vi.fn(),
  };

  return openRuntimeHostProduct({
    persistence: (mockPersistence as any),
    graphName: 'test',
    writerId: 'writer-1',
  });
}

describe('WarpCore syncWith', () => {
    let graph;

  beforeEach(async () => {
    graph = await createGraph();
    (graph)._cachedState = {};
    vi.spyOn((graph)._syncController, 'applySyncResponse').mockResolvedValue({ applied: 0 });
    vi.spyOn((graph)._syncController, 'createSyncRequest').mockResolvedValue({ type: 'sync-request', frontier: {} });
  });

  it('syncs over HTTP with default /sync path', async () => {
    const responsePayload = { type: 'sync-response', frontier: {}, patches: [] };
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(responsePayload));
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as any).port;

    try {
      const result = await graph.syncWith(`http://127.0.0.1:${port}`);
      expect(result.applied).toBe(0);
      expect((graph)._syncController.applySyncResponse).toHaveBeenCalledWith(responsePayload);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('retries on 500 responses and eventually succeeds', async () => {
    let calls = 0;
    const responsePayload = { type: 'sync-response', frontier: {}, patches: [] };
    const server = createServer((_req, res) => {
      calls += 1;
      if (calls < 3) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'nope' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(responsePayload));
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const port = (server.address() as any).port;

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      const result = await graph.syncWith(`http://127.0.0.1:${port}`, {
        retries: 2,
        baseDelayMs: 1,
        maxDelayMs: 1,
        timeoutMs: 500,
      });
      expect(result.attempts).toBe(3);
      expect(calls).toBe(3);
    } finally {
      randomSpy.mockRestore();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('syncs directly with a peer graph instance', async () => {
    const responsePayload = { type: 'sync-response', frontier: {}, patches: [] };
    const peer = { processSyncRequest: vi.fn().mockResolvedValue(responsePayload) };
        const events = ([]) as any[];

    await graph.syncWith(peer, {
      onStatus: (/** @type {any} */ evt) => events.push(evt.type),
    });

    expect(peer.processSyncRequest).toHaveBeenCalled();
    expect(events).toEqual([
      'connecting',
      'requestBuilt',
      'requestSent',
      'responseReceived',
      'applied',
      'complete',
    ]);
  });

  it('throws E_SYNC_REMOTE_URL for invalid URLs', async () => {
    await expect(graph.syncWith('not-a-url')).rejects.toMatchObject({
      code: 'E_SYNC_REMOTE_URL',
    });
  });
});
