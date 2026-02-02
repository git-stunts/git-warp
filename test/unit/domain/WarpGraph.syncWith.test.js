import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createServer } from 'node:http';
import WarpGraph from '../../../src/domain/WarpGraph.js';

async function createGraph() {
  const mockPersistence = {
    readRef: vi.fn().mockResolvedValue(null),
    listRefs: vi.fn().mockResolvedValue([]),
    updateRef: vi.fn().mockResolvedValue(),
    configGet: vi.fn().mockResolvedValue(null),
    configSet: vi.fn().mockResolvedValue(),
  };

  return WarpGraph.open({
    persistence: mockPersistence,
    graphName: 'test',
    writerId: 'writer-1',
  });
}

describe('WarpGraph syncWith', () => {
  let graph;

  beforeEach(async () => {
    graph = await createGraph();
    graph._cachedState = {};
    graph.applySyncResponse = vi.fn().mockReturnValue({ applied: 0 });
    graph.createSyncRequest = vi.fn().mockResolvedValue({ type: 'sync-request', frontier: {} });
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

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

    try {
      const result = await graph.syncWith(`http://127.0.0.1:${port}`);
      expect(result.applied).toBe(0);
      expect(graph.applySyncResponse).toHaveBeenCalledWith(responsePayload);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('retries on 500 responses and eventually succeeds', async () => {
    let calls = 0;
    const responsePayload = { type: 'sync-response', frontier: {}, patches: [] };
    const server = createServer((req, res) => {
      calls += 1;
      if (calls < 3) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'nope' }));
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(responsePayload));
    });

    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;

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
    const events = [];

    await graph.syncWith(peer, {
      onStatus: (evt) => events.push(evt.type),
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
