import { describe, it, expect, vi } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import NodeHttpAdapter from '../../../src/infrastructure/adapters/NodeHttpAdapter.js';

async function createGraph(writerId = 'writer-1') {
  const mockPersistence = {
    readRef: vi.fn().mockResolvedValue(null),
    listRefs: vi.fn().mockResolvedValue([]),
    updateRef: vi.fn().mockResolvedValue(undefined),
    configGet: vi.fn().mockResolvedValue(null),
    configSet: vi.fn().mockResolvedValue(undefined),
  };
  return WarpGraph.open({ persistence: mockPersistence, graphName: 'test', writerId });
}

function mockClientGraph(/** @type {WarpGraph} */ graph) {
  const g = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (graph));
  g._cachedState = {};
  g.applySyncResponse = vi.fn().mockReturnValue({ applied: 0 });
  g.createSyncRequest = vi.fn().mockResolvedValue({ type: 'sync-request', frontier: {} });
}

function mockServerGraph(/** @type {WarpGraph} */ graph) {
  const g = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (graph));
  g.processSyncRequest = vi.fn().mockResolvedValue({
    type: 'sync-response',
    frontier: {},
    patches: [],
  });
}

describe('WarpGraph syncAuth (real HTTP)', () => {
  it('serve(enforce) + syncWith(matching key) succeeds', async () => {
    const secret = 'shared-secret-123';
    const serverGraph = await createGraph('server-1');
    mockServerGraph(serverGraph);

    const handle = await serverGraph.serve({
      port: 0,
      httpPort: new NodeHttpAdapter(),
      auth: { keys: { default: secret }, mode: 'enforce' },
    });

    try {
      const clientGraph = await createGraph('client-1');
      mockClientGraph(clientGraph);

      const result = await clientGraph.syncWith(handle.url, {
        auth: { secret, keyId: 'default' },
        timeoutMs: 5000,
      });

      expect(result.applied).toBe(0);
      expect(clientGraph.applySyncResponse).toHaveBeenCalled();
      expect(serverGraph.processSyncRequest).toHaveBeenCalled();
    } finally {
      await handle.close();
    }
  });

  it('serve(enforce) + syncWith(no auth) fails with E_SYNC_PROTOCOL', async () => {
    const serverGraph = await createGraph('server-1');
    mockServerGraph(serverGraph);

    const handle = await serverGraph.serve({
      port: 0,
      httpPort: new NodeHttpAdapter(),
      auth: { keys: { default: 'secret-abc' }, mode: 'enforce' },
    });

    try {
      const clientGraph = await createGraph('client-1');
      mockClientGraph(clientGraph);

      await expect(
        clientGraph.syncWith(handle.url, { timeoutMs: 5000 }),
      ).rejects.toMatchObject({ code: 'E_SYNC_PROTOCOL' });

      expect(serverGraph.processSyncRequest).not.toHaveBeenCalled();
    } finally {
      await handle.close();
    }
  });

  it('serve(enforce) + syncWith(wrong secret) fails with E_SYNC_PROTOCOL', async () => {
    const serverGraph = await createGraph('server-1');
    mockServerGraph(serverGraph);

    const handle = await serverGraph.serve({
      port: 0,
      httpPort: new NodeHttpAdapter(),
      auth: { keys: { default: 'correct-secret' }, mode: 'enforce' },
    });

    try {
      const clientGraph = await createGraph('client-1');
      mockClientGraph(clientGraph);

      await expect(
        clientGraph.syncWith(handle.url, {
          auth: { secret: 'wrong-secret', keyId: 'default' },
          timeoutMs: 5000,
        }),
      ).rejects.toMatchObject({ code: 'E_SYNC_PROTOCOL' });

      expect(serverGraph.processSyncRequest).not.toHaveBeenCalled();
    } finally {
      await handle.close();
    }
  });

  it('serve(enforce) + syncWith(wrong key-id) fails with E_SYNC_PROTOCOL', async () => {
    const serverGraph = await createGraph('server-1');
    mockServerGraph(serverGraph);

    const handle = await serverGraph.serve({
      port: 0,
      httpPort: new NodeHttpAdapter(),
      auth: { keys: { default: 'secret-xyz' }, mode: 'enforce' },
    });

    try {
      const clientGraph = await createGraph('client-1');
      mockClientGraph(clientGraph);

      await expect(
        clientGraph.syncWith(handle.url, {
          auth: { secret: 'secret-xyz', keyId: 'nonexistent-key' },
          timeoutMs: 5000,
        }),
      ).rejects.toMatchObject({ code: 'E_SYNC_PROTOCOL' });

      expect(serverGraph.processSyncRequest).not.toHaveBeenCalled();
    } finally {
      await handle.close();
    }
  });

  it('serve(log-only) + syncWith(no auth) succeeds', async () => {
    const serverGraph = await createGraph('server-1');
    mockServerGraph(serverGraph);

    const handle = await serverGraph.serve({
      port: 0,
      httpPort: new NodeHttpAdapter(),
      auth: { keys: { default: 'secret-log' }, mode: 'log-only' },
    });

    try {
      const clientGraph = await createGraph('client-1');
      mockClientGraph(clientGraph);

      const result = await clientGraph.syncWith(handle.url, { timeoutMs: 5000 });

      expect(result.applied).toBe(0);
      expect(serverGraph.processSyncRequest).toHaveBeenCalled();
    } finally {
      await handle.close();
    }
  });

  it('serve(no auth) + syncWith(auth) succeeds (extra headers ignored)', async () => {
    const serverGraph = await createGraph('server-1');
    mockServerGraph(serverGraph);

    const handle = await serverGraph.serve({
      port: 0,
      httpPort: new NodeHttpAdapter(),
    });

    try {
      const clientGraph = await createGraph('client-1');
      mockClientGraph(clientGraph);

      const result = await clientGraph.syncWith(handle.url, {
        auth: { secret: 'some-secret', keyId: 'default' },
        timeoutMs: 5000,
      });

      expect(result.applied).toBe(0);
      expect(serverGraph.processSyncRequest).toHaveBeenCalled();
    } finally {
      await handle.close();
    }
  });

  it('each retry gets a fresh nonce (2 sequential syncs both succeed)', async () => {
    const secret = 'nonce-test-secret';
    const serverGraph = await createGraph('server-1');
    mockServerGraph(serverGraph);

    const handle = await serverGraph.serve({
      port: 0,
      httpPort: new NodeHttpAdapter(),
      auth: { keys: { default: secret }, mode: 'enforce' },
    });

    try {
      const clientGraph = await createGraph('client-1');
      mockClientGraph(clientGraph);

      const result1 = await clientGraph.syncWith(handle.url, {
        auth: { secret, keyId: 'default' },
        timeoutMs: 5000,
      });
      expect(result1.applied).toBe(0);

      const result2 = await clientGraph.syncWith(handle.url, {
        auth: { secret, keyId: 'default' },
        timeoutMs: 5000,
      });
      expect(result2.applied).toBe(0);

      expect(serverGraph.processSyncRequest).toHaveBeenCalledTimes(2);
    } finally {
      await handle.close();
    }
  });

  it('multi-key: server has 2 keys, client uses either and both work', async () => {
    const serverGraph = await createGraph('server-1');
    mockServerGraph(serverGraph);

    const handle = await serverGraph.serve({
      port: 0,
      httpPort: new NodeHttpAdapter(),
      auth: {
        keys: { primary: 'secret-alpha', secondary: 'secret-beta' },
        mode: 'enforce',
      },
    });

    try {
      const clientA = await createGraph('client-a');
      mockClientGraph(clientA);

      const resultA = await clientA.syncWith(handle.url, {
        auth: { secret: 'secret-alpha', keyId: 'primary' },
        timeoutMs: 5000,
      });
      expect(resultA.applied).toBe(0);

      const clientB = await createGraph('client-b');
      mockClientGraph(clientB);

      const resultB = await clientB.syncWith(handle.url, {
        auth: { secret: 'secret-beta', keyId: 'secondary' },
        timeoutMs: 5000,
      });
      expect(resultB.applied).toBe(0);

      expect(serverGraph.processSyncRequest).toHaveBeenCalledTimes(2);
    } finally {
      await handle.close();
    }
  });
});
