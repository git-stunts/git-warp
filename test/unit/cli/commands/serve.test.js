import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the dependencies that serve.js imports
vi.mock('../../../../bin/cli/shared.js', () => ({
  createPersistence: vi.fn(),
  listGraphNames: vi.fn(),
}));

vi.mock('../../../../src/domain/WarpGraph.js', () => ({
  default: { open: vi.fn() },
}));

vi.mock('../../../../src/infrastructure/adapters/WebCryptoAdapter.js', () => ({
  default: class MockWebCryptoAdapter {},
}));

class MockWsAdapter {
  createServer(/** @type {Function} */ _onConnection) {
    return {
      async listen(/** @type {number} */ port, /** @type {string} */ host) {
        return { port: port || 3000, host: host || '127.0.0.1' };
      },
      async close() {},
    };
  }
}

vi.mock('../../../../src/infrastructure/adapters/NodeWsAdapter.js', () => ({
  default: MockWsAdapter,
}));

vi.mock('../../../../src/infrastructure/adapters/BunWsAdapter.js', () => ({
  default: MockWsAdapter,
}));

vi.mock('../../../../src/infrastructure/adapters/DenoWsAdapter.js', () => ({
  default: MockWsAdapter,
}));

vi.mock('../../../../src/domain/services/WarpServeService.js', () => {
  /** @type {any} */
  let instance = null;
  return {
    default: class MockWarpServeService {
      constructor(/** @type {any} */ opts) {
        this.opts = opts;
        this.listenCalled = false;
        this.closeCalled = false;
        instance = this;
      }
      async listen(/** @type {number} */ port, /** @type {string} */ host) {
        this.listenCalled = true;
        this.listenPort = port;
        this.listenHost = host;
        return { port, host };
      }
      async close() { this.closeCalled = true; }
      static getInstance() { return instance; }
    },
  };
});

// Must import AFTER mocks are set up
const { createPersistence, listGraphNames } = await import('../../../../bin/cli/shared.js');
const WarpGraph = (await import('../../../../src/domain/WarpGraph.js')).default;
const handleServe = (await import('../../../../bin/cli/commands/serve.js')).default;

describe('handleServe', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    /** @type {any} */
    const mockPersistence = { ping: vi.fn().mockResolvedValue({ ok: true }) };
    /** @type {any} */ (createPersistence).mockResolvedValue({ persistence: mockPersistence });
    /** @type {any} */ (listGraphNames).mockResolvedValue(['default']);

    /** @type {any} */ (WarpGraph.open).mockResolvedValue({
      graphName: 'default',
      materialize: vi.fn().mockResolvedValue({}),
      subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
      getNodeProps: vi.fn(),
      createPatch: vi.fn(),
      query: vi.fn(),
    });
  });

  it('discovers all graphs when --graph is not specified', async () => {
    /** @type {any} */ (listGraphNames).mockResolvedValue(['alpha', 'beta']);
    /** @type {any} */ (WarpGraph.open).mockImplementation(
      async (/** @type {any} */ opts) => ({
        graphName: opts.graphName,
        materialize: vi.fn().mockResolvedValue({}),
        subscribe: vi.fn().mockReturnValue({ unsubscribe: vi.fn() }),
        getNodeProps: vi.fn(),
        createPatch: vi.fn(),
        query: vi.fn(),
      }),
    );

    const result = await handleServe({
      options: /** @type {any} */ ({ repo: '.', graph: undefined, writer: 'cli' }),
      args: [],
    });

    expect(WarpGraph.open).toHaveBeenCalledTimes(2);
    expect(result.payload.graphs).toEqual(['alpha', 'beta']);
  });

  it('scopes to a single graph with --graph', async () => {
    /** @type {any} */ (listGraphNames).mockResolvedValue(['alpha', 'beta']);

    const result = await handleServe({
      options: /** @type {any} */ ({ repo: '.', graph: 'alpha', writer: 'cli' }),
      args: [],
    });

    expect(WarpGraph.open).toHaveBeenCalledTimes(1);
    const openCall = /** @type {any} */ (WarpGraph.open).mock.calls[0][0];
    expect(openCall.graphName).toBe('alpha');
    expect(result.payload.graphs).toEqual(['alpha']);
  });

  it('throws when specified graph does not exist', async () => {
    /** @type {any} */ (listGraphNames).mockResolvedValue(['alpha']);

    await expect(
      handleServe({
        options: /** @type {any} */ ({ repo: '.', graph: 'nonexistent', writer: 'cli' }),
        args: [],
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('throws when no graphs exist in the repo', async () => {
    /** @type {any} */ (listGraphNames).mockResolvedValue([]);

    await expect(
      handleServe({
        options: /** @type {any} */ ({ repo: '.', writer: 'cli' }),
        args: [],
      }),
    ).rejects.toThrow(/no.*graph/i);
  });

  it('returns server address in the payload', async () => {
    const result = await handleServe({
      options: /** @type {any} */ ({ repo: '.', writer: 'cli' }),
      args: [],
    });

    expect(result.payload.host).toBeDefined();
    expect(result.payload.port).toBeDefined();
    expect(result.payload.url).toMatch(/^ws:\/\//);
  });

  it('uses custom port from args', async () => {
    const result = await handleServe({
      options: /** @type {any} */ ({ repo: '.', writer: 'cli' }),
      args: ['--port', '4567'],
    });

    expect(result.payload.port).toBe(4567);
  });

  it('returns a close function for clean shutdown', async () => {
    const result = await handleServe({
      options: /** @type {any} */ ({ repo: '.', writer: 'cli' }),
      args: [],
    });

    expect(typeof result.close).toBe('function');
  });
});
