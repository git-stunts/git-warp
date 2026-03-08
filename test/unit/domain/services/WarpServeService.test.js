import { describe, it, expect, vi, beforeEach } from 'vitest';
import WarpServeService from '../../../../src/domain/services/WarpServeService.js';

/**
 * Creates a mock WebSocketServerPort that captures the onConnection
 * handler and lets tests simulate client connections without real I/O.
 *
 * @returns {{ port: import('../../../../src/ports/WebSocketServerPort.js').default, getOnConnection: () => Function|null, simulateConnection: Function }}
 */
function createMockWsPort() {
  /** @type {Function|null} */
  let onConnection = null;

  const port = {
    createServer(/** @type {Function} */ handler) {
      onConnection = handler;
      return {
        async listen(/** @type {number} */ p, /** @type {string|undefined} */ host) {
          return { port: p || 9999, host: host || '127.0.0.1' };
        },
        async close() {},
      };
    },
  };

  function simulateConnection() {
    /** @type {Array<string>} */
    const sent = [];
    /** @type {Function|null} */
    let messageHandler = null;
    /** @type {Function|null} */
    let closeHandler = null;

    /** @type {import('../../../../src/ports/WebSocketServerPort.js').WsConnection} */
    const conn = {
      send(/** @type {string} */ msg) { sent.push(msg); },
      onMessage(/** @type {Function} */ handler) { messageHandler = handler; },
      onClose(/** @type {Function} */ handler) { closeHandler = handler; },
      close() { if (closeHandler) { closeHandler(1000, 'test'); } },
    };

    if (!onConnection) {
      throw new Error('No connection handler registered — call listen() first');
    }
    onConnection(conn);

    return {
      conn,
      sent,
      /** @param {string} msg */
      sendFromClient(msg) {
        if (messageHandler) { messageHandler(msg); }
      },
      triggerClose(/** @type {number} */ code = 1000, /** @type {string} */ reason = '') {
        if (closeHandler) { closeHandler(code, reason); }
      },
    };
  }

  return {
    port: /** @type {import('../../../../src/ports/WebSocketServerPort.js').default} */ (port),
    getOnConnection: () => onConnection,
    simulateConnection,
  };
}

/**
 * Creates a minimal mock WarpGraph with the methods WarpServeService needs.
 *
 * @param {Object} [overrides]
 * @param {string} [overrides.graphName]
 * @returns {any}
 */
function createMockGraph(overrides = {}) {
  const graphName = overrides.graphName || 'test-graph';

  const nodes = new Map();
  const edges = [];

  return {
    graphName,
    materialize: vi.fn().mockResolvedValue({
      nodeAlive: { entries: new Map(), tombstones: new Set() },
      edgeAlive: { entries: new Map(), tombstones: new Set() },
      prop: new Map(),
      observedFrontier: new Map(),
    }),
    subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
    getNodeProps: vi.fn().mockResolvedValue(null),
    createPatch: vi.fn().mockResolvedValue({
      addNode: vi.fn().mockReturnThis(),
      removeNode: vi.fn().mockReturnThis(),
      addEdge: vi.fn().mockReturnThis(),
      removeEdge: vi.fn().mockReturnThis(),
      setProperty: vi.fn().mockReturnThis(),
      commit: vi.fn().mockResolvedValue('abc123'),
    }),
    query: vi.fn().mockReturnValue({
      match: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue([]),
    }),
  };
}

describe('WarpServeService', () => {

  // ── Construction ────────────────────────────────────────────────────

  describe('construction', () => {
    it('requires a WebSocketServerPort', () => {
      expect(() => new WarpServeService({ wsPort: /** @type {any} */ (null), graphs: [] }))
        .toThrow();
    });

    it('requires at least one graph', () => {
      const { port } = createMockWsPort();
      expect(() => new WarpServeService({ wsPort: port, graphs: [] }))
        .toThrow();
    });

    it('accepts a single graph', () => {
      const { port } = createMockWsPort();
      const graph = createMockGraph();
      const service = new WarpServeService({ wsPort: port, graphs: [graph] });
      expect(service).toBeDefined();
    });

    it('accepts multiple graphs', () => {
      const { port } = createMockWsPort();
      const g1 = createMockGraph({ graphName: 'alpha' });
      const g2 = createMockGraph({ graphName: 'beta' });
      const service = new WarpServeService({ wsPort: port, graphs: [g1, g2] });
      expect(service).toBeDefined();
    });
  });

  // ── Connection lifecycle ────────────────────────────────────────────

  describe('connection lifecycle', () => {
    /** @type {ReturnType<typeof createMockWsPort>} */
    let ws;
    /** @type {any} */
    let graph;
    /** @type {WarpServeService} */
    let service;

    beforeEach(async () => {
      ws = createMockWsPort();
      graph = createMockGraph();
      service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);
    });

    it('sends a hello message on connect', () => {
      const client = ws.simulateConnection();
      expect(client.sent.length).toBe(1);
      const hello = JSON.parse(client.sent[0]);
      expect(hello.v).toBe(1);
      expect(hello.type).toBe('hello');
      expect(hello.payload.graphs).toEqual(['test-graph']);
    });

    it('hello includes protocol version', () => {
      const client = ws.simulateConnection();
      const hello = JSON.parse(client.sent[0]);
      expect(hello.payload.protocol).toBe(1);
    });

    it('cleans up on client disconnect', () => {
      const client = ws.simulateConnection();
      client.triggerClose();
      // Should not throw or leak — no observable side-effect to test,
      // but the service should remain functional for new connections.
      const client2 = ws.simulateConnection();
      expect(client2.sent.length).toBe(1);
    });
  });

  // ── Protocol: open ──────────────────────────────────────────────────

  describe('open', () => {
    /** @type {ReturnType<typeof createMockWsPort>} */
    let ws;
    /** @type {any} */
    let graph;
    /** @type {WarpServeService} */
    let service;

    beforeEach(async () => {
      ws = createMockWsPort();
      graph = createMockGraph();
      service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);
    });

    it('responds with materialized state when client opens a graph', async () => {
      const client = ws.simulateConnection();
      client.sent.length = 0; // clear hello

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'req-1',
        payload: { graph: 'test-graph', writerId: 'browser-writer-1' },
      }));

      // Allow async processing
      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.v).toBe(1);
      expect(msg.type).toBe('state');
      expect(msg.id).toBe('req-1');
      expect(msg.payload.graph).toBe('test-graph');
    });

    it('returns error for unknown graph name', async () => {
      const client = ws.simulateConnection();
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'req-2',
        payload: { graph: 'nonexistent', writerId: 'w1' },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.payload.code).toBe('E_UNKNOWN_GRAPH');
    });

    it('rejects messages with unsupported protocol version', async () => {
      const client = ws.simulateConnection();
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 999, type: 'open', id: 'req-3',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.payload.code).toBe('E_UNSUPPORTED_VERSION');
    });
  });

  // ── Protocol: mutate ────────────────────────────────────────────────

  describe('mutate', () => {
    /** @type {ReturnType<typeof createMockWsPort>} */
    let ws;
    /** @type {any} */
    let graph;
    /** @type {WarpServeService} */
    let service;

    beforeEach(async () => {
      ws = createMockWsPort();
      graph = createMockGraph();
      service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);
    });

    it('applies addNode mutation and returns ack', async () => {
      const client = ws.simulateConnection();
      // Open first
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'open-1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => client.sent.length >= 2); // hello + state
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'mutate', id: 'mut-1',
        payload: {
          graph: 'test-graph',
          ops: [{ op: 'addNode', args: ['node:test'] }],
        },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('ack');
      expect(msg.id).toBe('mut-1');
      expect(graph.createPatch).toHaveBeenCalled();
    });

    it('rejects ops not in the allowlist', async () => {
      const client = ws.simulateConnection();
      // Open first
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => client.sent.length >= 2);
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'mutate', id: 'mut-bad',
        payload: {
          graph: 'test-graph',
          ops: [{ op: 'constructor', args: [] }],
        },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.id).toBe('mut-bad');
      expect(msg.payload.code).toBe('E_INVALID_OP');
    });

    it('rejects mutate with wrong arg count', async () => {
      const client = ws.simulateConnection();
      // Open first
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => client.sent.length >= 2);
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'mutate', id: 'mut-argc',
        payload: {
          graph: 'test-graph',
          ops: [{ op: 'addNode', args: [] }],
        },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.id).toBe('mut-argc');
      expect(msg.payload.code).toBe('E_INVALID_ARGS');
    });

    it('rejects mutate with wrong arg type', async () => {
      const client = ws.simulateConnection();
      // Open first
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => client.sent.length >= 2);
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'mutate', id: 'mut-argt',
        payload: {
          graph: 'test-graph',
          ops: [{ op: 'addNode', args: [42] }],
        },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.id).toBe('mut-argt');
      expect(msg.payload.code).toBe('E_INVALID_ARGS');
    });

    it('allows wildcard arg types for setProperty value', async () => {
      const client = ws.simulateConnection();
      // Open first
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => client.sent.length >= 2);
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'mutate', id: 'mut-wild',
        payload: {
          graph: 'test-graph',
          ops: [{ op: 'setProperty', args: ['node:1', 'color', 42] }],
        },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('ack');
      expect(msg.id).toBe('mut-wild');
    });

    it('rejects mutate before open', async () => {
      const client = ws.simulateConnection();
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'mutate', id: 'mut-2',
        payload: {
          graph: 'test-graph',
          ops: [{ op: 'addNode', args: ['node:test'] }],
        },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.payload.code).toBe('E_NOT_OPENED');
    });
  });

  // ── Protocol: inspect ───────────────────────────────────────────────

  describe('inspect', () => {
    /** @type {ReturnType<typeof createMockWsPort>} */
    let ws;
    /** @type {any} */
    let graph;
    /** @type {WarpServeService} */
    let service;

    beforeEach(async () => {
      ws = createMockWsPort();
      graph = createMockGraph();
      graph.getNodeProps.mockResolvedValue({ name: 'Alice', role: 'admin' });
      service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);
    });

    it('returns node properties', async () => {
      const client = ws.simulateConnection();
      // Open first
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => client.sent.length >= 2);
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'inspect', id: 'ins-1',
        payload: { graph: 'test-graph', nodeId: 'user:alice' },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('inspect');
      expect(msg.id).toBe('ins-1');
      expect(msg.payload.props).toEqual({ name: 'Alice', role: 'admin' });
    });
  });

  // ── Protocol: seek ──────────────────────────────────────────────────

  describe('seek', () => {
    /** @type {ReturnType<typeof createMockWsPort>} */
    let ws;
    /** @type {any} */
    let graph;
    /** @type {WarpServeService} */
    let service;

    beforeEach(async () => {
      ws = createMockWsPort();
      graph = createMockGraph();
      service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);
    });

    it('re-materializes with ceiling and sends state', async () => {
      const client = ws.simulateConnection();
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => client.sent.length >= 2);
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'seek', id: 'sk-1',
        payload: { graph: 'test-graph', ceiling: 5 },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('state');
      expect(msg.id).toBe('sk-1');
      expect(graph.materialize).toHaveBeenCalledWith(
        expect.objectContaining({ ceiling: 5 }),
      );
    });

    it('treats Infinity ceiling as materialize-at-head', async () => {
      const client = ws.simulateConnection();
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => client.sent.length >= 2);
      graph.materialize.mockClear();
      client.sent.length = 0;

      // Infinity is not valid JSON, so we hand-craft the raw string
      // to simulate a non-JSON transport or future binary protocol.
      client.sendFromClient(
        '{"v":1,"type":"seek","id":"sk-inf","payload":{"graph":"test-graph","ceiling":1e999}}',
      );

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('state');
      expect(msg.id).toBe('sk-inf');
      // Infinity should NOT be passed as ceiling — materialize at head
      expect(graph.materialize).toHaveBeenCalledWith({});
    });
  });

  // ── Live diff push ──────────────────────────────────────────────────

  describe('live diff push', () => {
    it('pushes diffs to subscribed clients when graph changes', async () => {
      const ws = createMockWsPort();
      const graph = createMockGraph();

      /** @type {Function|null} */
      let capturedOnChange = null;
      graph.subscribe.mockImplementation((/** @type {any} */ opts) => {
        capturedOnChange = opts.onChange;
        return { unsubscribe: vi.fn() };
      });

      const service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);

      const client = ws.simulateConnection();
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => client.sent.length >= 2);
      client.sent.length = 0;

      // Simulate a graph change
      const fakeDiff = {
        nodes: { added: ['node:new'], removed: [] },
        edges: { added: [], removed: [] },
        props: { set: [], removed: [] },
      };

      expect(capturedOnChange).not.toBeNull();
      /** @type {any} */ (capturedOnChange)(fakeDiff);

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('diff');
      expect(msg.payload.graph).toBe('test-graph');
      expect(msg.payload.diff.nodes.added).toEqual(['node:new']);
    });

    it('broadcasts diffs to all clients subscribed to the same graph', async () => {
      const ws = createMockWsPort();
      const graph = createMockGraph();

      /** @type {Function|null} */
      let capturedOnChange = null;
      graph.subscribe.mockImplementation((/** @type {any} */ opts) => {
        capturedOnChange = opts.onChange;
        return { unsubscribe: vi.fn() };
      });

      const service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);

      // Connect and open two clients on the same graph
      const client1 = ws.simulateConnection();
      client1.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => client1.sent.length >= 2);
      client1.sent.length = 0;

      const client2 = ws.simulateConnection();
      client2.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o2',
        payload: { graph: 'test-graph', writerId: 'w2' },
      }));
      await vi.waitFor(() => client2.sent.length >= 2);
      client2.sent.length = 0;

      // Trigger a diff
      const fakeDiff = {
        nodes: { added: ['node:broadcast'], removed: [] },
        edges: { added: [], removed: [] },
        props: { set: [], removed: [] },
      };

      expect(capturedOnChange).not.toBeNull();
      /** @type {any} */ (capturedOnChange)(fakeDiff);

      await vi.waitFor(() => expect(client1.sent.length).toBeGreaterThan(0));
      await vi.waitFor(() => expect(client2.sent.length).toBeGreaterThan(0));

      const msg1 = JSON.parse(client1.sent[0]);
      const msg2 = JSON.parse(client2.sent[0]);

      expect(msg1.type).toBe('diff');
      expect(msg1.payload.diff.nodes.added).toEqual(['node:broadcast']);
      expect(msg2.type).toBe('diff');
      expect(msg2.payload.diff.nodes.added).toEqual(['node:broadcast']);
    });

    it('does not push diffs to clients that have not opened that graph', async () => {
      const ws = createMockWsPort();
      const g1 = createMockGraph({ graphName: 'alpha' });
      const g2 = createMockGraph({ graphName: 'beta' });

      /** @type {Function|null} */
      let g1OnChange = null;
      g1.subscribe.mockImplementation((/** @type {any} */ opts) => {
        g1OnChange = opts.onChange;
        return { unsubscribe: vi.fn() };
      });

      const service = new WarpServeService({ wsPort: ws.port, graphs: [g1, g2] });
      await service.listen(0);

      const client = ws.simulateConnection();
      // Open beta, not alpha
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'beta', writerId: 'w1' },
      }));
      await vi.waitFor(() => client.sent.length >= 2);
      client.sent.length = 0;

      // Alpha changes — client should NOT get it
      if (g1OnChange) {
        /** @type {any} */ (g1OnChange)({
          nodes: { added: ['node:x'], removed: [] },
          edges: { added: [], removed: [] },
          props: { set: [], removed: [] },
        });
      }

      // _broadcastDiff is synchronous — no async delay needed
      expect(client.sent).toHaveLength(0);
    });
  });

  // ── Malformed messages ──────────────────────────────────────────────

  describe('malformed messages', () => {
    /** @type {ReturnType<typeof createMockWsPort>} */
    let ws;
    /** @type {WarpServeService} */
    let service;

    beforeEach(async () => {
      ws = createMockWsPort();
      const graph = createMockGraph();
      service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);
    });

    it('returns error for invalid JSON', async () => {
      const client = ws.simulateConnection();
      client.sent.length = 0;

      client.sendFromClient('not valid json {{{');

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.payload.code).toBe('E_INVALID_MESSAGE');
    });

    it('returns error for missing type field', async () => {
      const client = ws.simulateConnection();
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({ v: 1, payload: {} }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.payload.code).toBe('E_INVALID_MESSAGE');
    });

    it('returns E_INVALID_PAYLOAD for open with missing graph', async () => {
      const client = ws.simulateConnection();
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o-bad',
        payload: {},
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.id).toBe('o-bad');
      expect(msg.payload.code).toBe('E_INVALID_PAYLOAD');
    });

    it('returns E_INVALID_PAYLOAD for mutate with missing ops', async () => {
      const client = ws.simulateConnection();
      // Open first
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => client.sent.length >= 2);
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'mutate', id: 'mut-bad',
        payload: { graph: 'test-graph' },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.id).toBe('mut-bad');
      expect(msg.payload.code).toBe('E_INVALID_PAYLOAD');
    });

    it('returns E_INVALID_PAYLOAD for inspect with missing nodeId', async () => {
      const client = ws.simulateConnection();
      // Open first
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => client.sent.length >= 2);
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'inspect', id: 'ins-bad',
        payload: { graph: 'test-graph' },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.id).toBe('ins-bad');
      expect(msg.payload.code).toBe('E_INVALID_PAYLOAD');
    });

    it('returns E_INVALID_PAYLOAD for seek with missing ceiling', async () => {
      const client = ws.simulateConnection();
      // Open first
      client.sendFromClient(JSON.stringify({
        v: 1, type: 'open', id: 'o1',
        payload: { graph: 'test-graph', writerId: 'w1' },
      }));
      await vi.waitFor(() => client.sent.length >= 2);
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'seek', id: 'sk-bad',
        payload: { graph: 'test-graph' },
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.id).toBe('sk-bad');
      expect(msg.payload.code).toBe('E_INVALID_PAYLOAD');
    });

    it('returns error for unknown message type', async () => {
      const client = ws.simulateConnection();
      client.sent.length = 0;

      client.sendFromClient(JSON.stringify({
        v: 1, type: 'explode', id: 'x', payload: {},
      }));

      await vi.waitFor(() => expect(client.sent.length).toBeGreaterThan(0));

      const msg = JSON.parse(client.sent[0]);
      expect(msg.type).toBe('error');
      expect(msg.payload.code).toBe('E_UNKNOWN_TYPE');
    });
  });

  // ── Shutdown ────────────────────────────────────────────────────────

  describe('shutdown', () => {
    it('close() shuts down cleanly', async () => {
      const ws = createMockWsPort();
      const graph = createMockGraph();
      const service = new WarpServeService({ wsPort: ws.port, graphs: [graph] });
      await service.listen(0);
      await expect(service.close()).resolves.toBeUndefined();
    });
  });
});
