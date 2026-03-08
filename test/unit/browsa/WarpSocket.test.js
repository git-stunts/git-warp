import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import WarpSocket from '../../../demo/browsa/src/net/WarpSocket.js';

/**
 * Creates a mock WebSocket that captures sent messages and lets
 * tests simulate server responses.
 *
 * @returns {{ MockWebSocket: typeof globalThis.WebSocket, sent: string[], simulateOpen: () => void, simulateMessage: (data: string) => void, simulateClose: (code?: number, reason?: string) => void, simulateError: () => void }}
 */
function createMockWebSocket() {
  /** @type {string[]} */
  const sent = [];
  /** @type {Function|null} */
  let onopen = null;
  /** @type {Function|null} */
  let onmessage = null;
  /** @type {Function|null} */
  let onclose = null;
  /** @type {Function|null} */
  let onerror = null;
  let readyState = 0; // CONNECTING

  /** @type {any} */
  const instance = {
    get readyState() { return readyState; },
    get OPEN() { return 1; },
    get CLOSED() { return 3; },
    send(/** @type {string} */ msg) { sent.push(msg); },
    close() {
      readyState = 3;
      if (onclose) { onclose({ code: 1000, reason: '' }); }
    },
    set onopen(fn) { onopen = fn; },
    get onopen() { return onopen; },
    set onmessage(fn) { onmessage = fn; },
    get onmessage() { return onmessage; },
    set onclose(fn) { onclose = fn; },
    get onclose() { return onclose; },
    set onerror(fn) { onerror = fn; },
    get onerror() { return onerror; },
  };

  /** @type {any} */
  const MockWebSocket = function MockWebSocket() { return instance; };
  MockWebSocket.OPEN = 1;
  MockWebSocket.CLOSED = 3;

  return {
    MockWebSocket,
    sent,
    simulateOpen() {
      readyState = 1;
      if (onopen) { onopen({}); }
    },
    simulateMessage(/** @type {string} */ data) {
      if (onmessage) { onmessage({ data }); }
    },
    simulateClose(/** @type {number} */ code = 1000, /** @type {string} */ reason = '') {
      readyState = 3;
      if (onclose) { onclose({ code, reason }); }
    },
    simulateError() {
      if (onerror) { onerror(new Error('ws error')); }
    },
  };
}

describe('WarpSocket', () => {

  // ── Connection lifecycle ────────────────────────────────────────────

  describe('connect', () => {
    it('resolves with hello payload on successful connection', async () => {
      const mock = createMockWebSocket();
      const ws = new WarpSocket('ws://localhost:3000', { WebSocket: mock.MockWebSocket });

      const connectPromise = ws.connect();

      // Simulate: open → server sends hello
      mock.simulateOpen();
      mock.simulateMessage(JSON.stringify({
        v: 1, type: 'hello',
        payload: { protocol: 1, graphs: ['default', 'other'] },
      }));

      const hello = await connectPromise;
      expect(hello.protocol).toBe(1);
      expect(hello.graphs).toEqual(['default', 'other']);
    });

    it('rejects if WebSocket errors before hello', async () => {
      const mock = createMockWebSocket();
      const ws = new WarpSocket('ws://localhost:3000', { WebSocket: mock.MockWebSocket });

      const connectPromise = ws.connect();
      mock.simulateError();
      mock.simulateClose(1006, 'abnormal');

      await expect(connectPromise).rejects.toThrow();
    });
  });

  // ── Request-response: open ──────────────────────────────────────────

  describe('open', () => {
    /** @type {ReturnType<typeof createMockWebSocket>} */
    let mock;
    /** @type {WarpSocket} */
    let ws;

    beforeEach(async () => {
      mock = createMockWebSocket();
      ws = new WarpSocket('ws://localhost:3000', { WebSocket: mock.MockWebSocket });
      const p = ws.connect();
      mock.simulateOpen();
      mock.simulateMessage(JSON.stringify({
        v: 1, type: 'hello', payload: { protocol: 1, graphs: ['test'] },
      }));
      await p;
    });

    it('sends open message and resolves with state', async () => {
      const openPromise = ws.open({ graph: 'test', writerId: 'w1' });

      // Find the sent message and extract its id
      expect(mock.sent.length).toBe(1);
      const sent = JSON.parse(mock.sent[0]);
      expect(sent.type).toBe('open');
      expect(sent.payload.graph).toBe('test');
      expect(sent.payload.writerId).toBe('w1');
      expect(sent.id).toBeDefined();

      // Simulate server state response
      mock.simulateMessage(JSON.stringify({
        v: 1, type: 'state', id: sent.id,
        payload: { graph: 'test', nodes: [], edges: [], frontier: {} },
      }));

      const state = await openPromise;
      expect(state.graph).toBe('test');
      expect(state.nodes).toEqual([]);
    });

    it('rejects if server returns error', async () => {
      const openPromise = ws.open({ graph: 'nonexistent', writerId: 'w1' });

      const sent = JSON.parse(mock.sent[0]);
      mock.simulateMessage(JSON.stringify({
        v: 1, type: 'error', id: sent.id,
        payload: { code: 'E_UNKNOWN_GRAPH', message: 'Unknown graph' },
      }));

      await expect(openPromise).rejects.toThrow('Unknown graph');
    });
  });

  // ── Request-response: concurrent & timeout ─────────────────────────

  describe('request-response', () => {
    /** @type {ReturnType<typeof createMockWebSocket>} */
    let mock;
    /** @type {WarpSocket} */
    let ws;

    beforeEach(async () => {
      mock = createMockWebSocket();
      ws = new WarpSocket('ws://localhost:3000', { WebSocket: mock.MockWebSocket });
      const p = ws.connect();
      mock.simulateOpen();
      mock.simulateMessage(JSON.stringify({
        v: 1, type: 'hello', payload: { protocol: 1, graphs: ['test'] },
      }));
      await p;
    });

    it('resolves two concurrent in-flight requests out of order', async () => {
      // Issue two requests simultaneously
      const openPromise = ws.open({ graph: 'test', writerId: 'w1' });
      const inspectPromise = ws.inspect({ graph: 'test', nodeId: 'user:alice' });

      // Extract both sent messages
      expect(mock.sent.length).toBe(2);
      const sentOpen = JSON.parse(mock.sent[0]);
      const sentInspect = JSON.parse(mock.sent[1]);
      expect(sentOpen.type).toBe('open');
      expect(sentInspect.type).toBe('inspect');

      // Respond to the SECOND request first
      mock.simulateMessage(JSON.stringify({
        v: 1, type: 'inspect', id: sentInspect.id,
        payload: { graph: 'test', nodeId: 'user:alice', props: { name: 'Alice' } },
      }));

      // Then respond to the FIRST request
      mock.simulateMessage(JSON.stringify({
        v: 1, type: 'state', id: sentOpen.id,
        payload: { graph: 'test', nodes: [{ id: 'n1', props: {} }], edges: [], frontier: {} },
      }));

      // Both promises resolve with their correct payloads
      const openResult = await openPromise;
      const inspectResult = await inspectPromise;

      expect(openResult.graph).toBe('test');
      expect(openResult.nodes).toHaveLength(1);
      expect(openResult.nodes[0].id).toBe('n1');

      expect(inspectResult.graph).toBe('test');
      expect(inspectResult.nodeId).toBe('user:alice');
      expect(inspectResult.props).toEqual({ name: 'Alice' });
    });

    it('rejects with timeout when server does not respond', async () => {
      vi.useFakeTimers();

      const timeoutMock = createMockWebSocket();
      const timeoutWs = new WarpSocket('ws://localhost:3000', {
        WebSocket: timeoutMock.MockWebSocket,
        requestTimeoutMs: 100,
      });
      const p = timeoutWs.connect();
      timeoutMock.simulateOpen();
      timeoutMock.simulateMessage(JSON.stringify({
        v: 1, type: 'hello', payload: { protocol: 1, graphs: ['test'] },
      }));
      await p;

      const openPromise = timeoutWs.open({ graph: 'test', writerId: 'w1' });

      // Advance past the timeout
      vi.advanceTimersByTime(100);

      await expect(openPromise).rejects.toThrow(/timed out/);

      vi.useRealTimers();
    });
  });

  // ── Request-response: mutate ────────────────────────────────────────

  describe('mutate', () => {
    /** @type {ReturnType<typeof createMockWebSocket>} */
    let mock;
    /** @type {WarpSocket} */
    let ws;

    beforeEach(async () => {
      mock = createMockWebSocket();
      ws = new WarpSocket('ws://localhost:3000', { WebSocket: mock.MockWebSocket });
      const p = ws.connect();
      mock.simulateOpen();
      mock.simulateMessage(JSON.stringify({
        v: 1, type: 'hello', payload: { protocol: 1, graphs: ['test'] },
      }));
      await p;
    });

    it('sends mutate message and resolves on ack', async () => {
      const mutPromise = ws.mutate({
        graph: 'test',
        ops: [{ op: 'addNode', args: ['node:1'] }],
      });

      const sent = JSON.parse(mock.sent[0]);
      expect(sent.type).toBe('mutate');
      expect(sent.payload.ops).toHaveLength(1);

      mock.simulateMessage(JSON.stringify({
        v: 1, type: 'ack', id: sent.id, payload: { sha: 'abc123' },
      }));

      const result = await mutPromise;
      expect(result.sha).toBe('abc123');
    });
  });

  // ── Request-response: inspect ───────────────────────────────────────

  describe('inspect', () => {
    /** @type {ReturnType<typeof createMockWebSocket>} */
    let mock;
    /** @type {WarpSocket} */
    let ws;

    beforeEach(async () => {
      mock = createMockWebSocket();
      ws = new WarpSocket('ws://localhost:3000', { WebSocket: mock.MockWebSocket });
      const p = ws.connect();
      mock.simulateOpen();
      mock.simulateMessage(JSON.stringify({
        v: 1, type: 'hello', payload: { protocol: 1, graphs: ['test'] },
      }));
      await p;
    });

    it('sends inspect and resolves with props', async () => {
      const insPromise = ws.inspect({ graph: 'test', nodeId: 'user:alice' });

      const sent = JSON.parse(mock.sent[0]);
      expect(sent.type).toBe('inspect');

      mock.simulateMessage(JSON.stringify({
        v: 1, type: 'inspect', id: sent.id,
        payload: { graph: 'test', nodeId: 'user:alice', props: { name: 'Alice' } },
      }));

      const result = await insPromise;
      expect(result.props).toEqual({ name: 'Alice' });
    });
  });

  // ── Request-response: seek ──────────────────────────────────────────

  describe('seek', () => {
    /** @type {ReturnType<typeof createMockWebSocket>} */
    let mock;
    /** @type {WarpSocket} */
    let ws;

    beforeEach(async () => {
      mock = createMockWebSocket();
      ws = new WarpSocket('ws://localhost:3000', { WebSocket: mock.MockWebSocket });
      const p = ws.connect();
      mock.simulateOpen();
      mock.simulateMessage(JSON.stringify({
        v: 1, type: 'hello', payload: { protocol: 1, graphs: ['test'] },
      }));
      await p;
    });

    it('sends seek and resolves with state', async () => {
      const seekPromise = ws.seek({ graph: 'test', ceiling: 5 });

      const sent = JSON.parse(mock.sent[0]);
      expect(sent.type).toBe('seek');
      expect(sent.payload.ceiling).toBe(5);

      mock.simulateMessage(JSON.stringify({
        v: 1, type: 'state', id: sent.id,
        payload: { graph: 'test', nodes: [{ id: 'n1', props: {} }], edges: [], frontier: {} },
      }));

      const result = await seekPromise;
      expect(result.nodes).toHaveLength(1);
    });
  });

  // ── Push messages (diffs) ───────────────────────────────────────────

  describe('onDiff', () => {
    it('fires callback on incoming diff message', async () => {
      const mock = createMockWebSocket();
      const ws = new WarpSocket('ws://localhost:3000', { WebSocket: mock.MockWebSocket });
      const p = ws.connect();
      mock.simulateOpen();
      mock.simulateMessage(JSON.stringify({
        v: 1, type: 'hello', payload: { protocol: 1, graphs: ['test'] },
      }));
      await p;

      /** @type {unknown[]} */
      const received = [];
      ws.onDiff((diff) => received.push(diff));

      mock.simulateMessage(JSON.stringify({
        v: 1, type: 'diff',
        payload: {
          graph: 'test',
          diff: { nodes: { added: ['n1'], removed: [] }, edges: { added: [], removed: [] }, props: { set: [], removed: [] } },
        },
      }));

      expect(received).toHaveLength(1);
      expect(/** @type {any} */ (received[0]).graph).toBe('test');
      expect(/** @type {any} */ (received[0]).diff.nodes.added).toEqual(['n1']);
    });

    it('fires callback for diff messages even if they carry an id', async () => {
      const mock = createMockWebSocket();
      const ws = new WarpSocket('ws://localhost:3000', { WebSocket: mock.MockWebSocket });
      const p = ws.connect();
      mock.simulateOpen();
      mock.simulateMessage(JSON.stringify({
        v: 1, type: 'hello', payload: { protocol: 1, graphs: ['test'] },
      }));
      await p;

      /** @type {unknown[]} */
      const received = [];
      ws.onDiff((diff) => received.push(diff));

      // This has an id — it's a response, not a push
      mock.simulateMessage(JSON.stringify({
        v: 1, type: 'diff', id: 'req-1',
        payload: { graph: 'test', diff: { nodes: { added: [], removed: [] }, edges: { added: [], removed: [] }, props: { set: [], removed: [] } } },
      }));

      // Diff with an unmatched id falls through to push dispatch — callback fires
      expect(received).toHaveLength(1);
    });
  });

  // ── Disconnect ──────────────────────────────────────────────────────

  describe('disconnect', () => {
    it('fires onDisconnect callback', async () => {
      const mock = createMockWebSocket();
      const ws = new WarpSocket('ws://localhost:3000', { WebSocket: mock.MockWebSocket });
      const p = ws.connect();
      mock.simulateOpen();
      mock.simulateMessage(JSON.stringify({
        v: 1, type: 'hello', payload: { protocol: 1, graphs: ['test'] },
      }));
      await p;

      let disconnected = false;
      ws.onDisconnect(() => { disconnected = true; });

      mock.simulateClose(1000, 'bye');
      expect(disconnected).toBe(true);
    });

    it('rejects pending requests on disconnect', async () => {
      const mock = createMockWebSocket();
      const ws = new WarpSocket('ws://localhost:3000', { WebSocket: mock.MockWebSocket });
      const p = ws.connect();
      mock.simulateOpen();
      mock.simulateMessage(JSON.stringify({
        v: 1, type: 'hello', payload: { protocol: 1, graphs: ['test'] },
      }));
      await p;

      const openPromise = ws.open({ graph: 'test', writerId: 'w1' });
      mock.simulateClose(1006, 'gone');

      await expect(openPromise).rejects.toThrow();
    });
  });

  // ── close() ─────────────────────────────────────────────────────────

  describe('close', () => {
    it('cleanly closes the connection', async () => {
      const mock = createMockWebSocket();
      const ws = new WarpSocket('ws://localhost:3000', { WebSocket: mock.MockWebSocket });
      const p = ws.connect();
      mock.simulateOpen();
      mock.simulateMessage(JSON.stringify({
        v: 1, type: 'hello', payload: { protocol: 1, graphs: ['test'] },
      }));
      await p;

      ws.close();
      // Should not throw
    });
  });

  // ── Protocol version mismatch ───────────────────────────────────────

  describe('protocol version', () => {
    it('sends v:1 in all outgoing messages', async () => {
      const mock = createMockWebSocket();
      const ws = new WarpSocket('ws://localhost:3000', { WebSocket: mock.MockWebSocket });
      const p = ws.connect();
      mock.simulateOpen();
      mock.simulateMessage(JSON.stringify({
        v: 1, type: 'hello', payload: { protocol: 1, graphs: ['test'] },
      }));
      await p;

      ws.open({ graph: 'test', writerId: 'w1' });
      const sent = JSON.parse(mock.sent[0]);
      expect(sent.v).toBe(1);
    });
  });
});
