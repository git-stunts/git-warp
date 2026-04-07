import { describe, it, expect, vi, beforeEach } from 'vitest';
import WarpApp from '../../../src/domain/WarpApp.js';

// ── Mock runtime + core ───────────────────────────────────────────────────────

function createMockRuntime() {
  return {
    graphName: 'test-graph',
    writerId: 'writer-1',
    writer: vi.fn(async () => ({ append: vi.fn() })),
    createPatch: vi.fn(async () => ({ addNode: vi.fn(), commit: vi.fn() })),
    patch: vi.fn(async () => 'sha-patch'),
    patchMany: vi.fn(async () => ['sha-1', 'sha-2']),
    syncWith: vi.fn(async () => ({ applied: 0 })),
    worldline: vi.fn(() => ({ nodes: [] })),
    observer: vi.fn(async () => ({ snapshot: {} })),
    translationCost: vi.fn(async () => 42),
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
    watch: vi.fn(() => ({ unsubscribe: vi.fn() })),
    // Content methods — accessed via callInternalRuntimeMethod prototype chain
    getContent: vi.fn(async () => new Uint8Array([1, 2, 3])),
    getContentStream: vi.fn(async function* () { yield new Uint8Array([1]); }),
    getContentOid: vi.fn(async () => 'a'.repeat(40)),
    getContentMeta: vi.fn(async () => ({ oid: 'a'.repeat(40), mime: 'text/plain', size: 42 })),
    getEdgeContent: vi.fn(async () => new Uint8Array([4, 5, 6])),
    getEdgeContentStream: vi.fn(async function* () { yield new Uint8Array([2]); }),
    getEdgeContentOid: vi.fn(async () => 'b'.repeat(40)),
    getEdgeContentMeta: vi.fn(async () => ({ oid: 'b'.repeat(40), mime: null, size: 10 })),
  };
}

function createMockCore() {
  return {
    createStrand: vi.fn(async () => ({ strandId: 's1' })),
    getStrand: vi.fn(async () => ({ strandId: 's1' })),
    listStrands: vi.fn(async () => [{ strandId: 's1' }]),
    braidStrand: vi.fn(async () => ({ strandId: 's1' })),
    dropStrand: vi.fn(async () => true),
    createStrandPatch: vi.fn(async () => ({ addNode: vi.fn() })),
    patchStrand: vi.fn(async () => 'sha-strand'),
    queueStrandIntent: vi.fn(async () => ({ intentId: 'i1' })),
    listStrandIntents: vi.fn(async () => [{ intentId: 'i1' }]),
    tickStrand: vi.fn(async () => ({ tickId: 't1' })),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WarpApp delegation', () => {
  /** @type {WarpApp} */
  let app;
  let mockRuntime;
  let mockCore;

  beforeEach(() => {
    mockRuntime = createMockRuntime();
    mockCore = createMockCore();

    // Construct WarpApp with a mock core that also acts as runtime
    app = new WarpApp(mockCore);
    // Override _runtime() to return our mock runtime (which has all the methods)
    app._runtime = () => mockRuntime;
    // Override core() to return our mock core
    app.core = () => mockCore;
  });

  // ── Patch building & writing ────────────────────────────────────────────

  describe('writer', () => {
    it('delegates to _runtime().writer()', async () => {
      const result = await app.writer('custom-writer');

      expect(mockRuntime.writer).toHaveBeenCalledWith('custom-writer');
      expect(result).toEqual({ append: expect.any(Function) });
    });

    it('passes undefined when no writerId', async () => {
      await app.writer();

      expect(mockRuntime.writer).toHaveBeenCalledWith(undefined);
    });
  });

  describe('createPatch', () => {
    it('delegates to _runtime().createPatch()', async () => {
      const result = await app.createPatch();

      expect(mockRuntime.createPatch).toHaveBeenCalledWith();
      expect(result).toEqual({ addNode: expect.any(Function), commit: expect.any(Function) });
    });
  });

  describe('patch', () => {
    it('delegates to _runtime().patch()', async () => {
      const buildFn = vi.fn();
      const result = await app.patch(buildFn);

      expect(mockRuntime.patch).toHaveBeenCalledWith(buildFn);
      expect(result).toBe('sha-patch');
    });
  });

  describe('patchMany', () => {
    it('delegates to _runtime().patchMany()', async () => {
      const build1 = vi.fn();
      const build2 = vi.fn();
      const result = await app.patchMany(build1, build2);

      expect(mockRuntime.patchMany).toHaveBeenCalledWith(build1, build2);
      expect(result).toEqual(['sha-1', 'sha-2']);
    });
  });

  // ── Querying ────────────────────────────────────────────────────────────

  describe('worldline', () => {
    it('delegates to _runtime().worldline()', () => {
      const opts = { ceiling: 5 };
      const result = app.worldline(opts);

      expect(mockRuntime.worldline).toHaveBeenCalledWith(opts);
      expect(result).toEqual({ nodes: [] });
    });
  });

  describe('observer', () => {
    it('delegates with (name, config, options) overload', async () => {
      const config = { nodes: '*' };
      const opts = { ceiling: 5 };
      await app.observer('obs-name', config, opts);

      expect(mockRuntime.observer).toHaveBeenCalledWith('obs-name', config, opts);
    });

    it('delegates with (config, options) overload', async () => {
      const config = { nodes: '*' };
      const opts = { ceiling: 5 };
      await app.observer(config, opts);

      expect(mockRuntime.observer).toHaveBeenCalledWith(config, opts);
    });
  });

  describe('translationCost', () => {
    it('delegates to _runtime().translationCost()', async () => {
      const configA = { nodes: 'a' };
      const configB = { nodes: 'b' };
      const result = await app.translationCost(configA, configB);

      expect(mockRuntime.translationCost).toHaveBeenCalledWith(configA, configB);
      expect(result).toBe(42);
    });
  });

  describe('subscribe', () => {
    it('delegates to _runtime().subscribe()', () => {
      const opts = { onChange: vi.fn() };
      const result = app.subscribe(opts);

      expect(mockRuntime.subscribe).toHaveBeenCalledWith(opts);
      expect(result).toEqual({ unsubscribe: expect.any(Function) });
    });
  });

  describe('watch', () => {
    it('delegates to _runtime().watch()', () => {
      const result = app.watch('user:*', { onChange: vi.fn() });

      expect(mockRuntime.watch).toHaveBeenCalledWith('user:*', { onChange: expect.any(Function) });
      expect(result).toEqual({ unsubscribe: expect.any(Function) });
    });
  });

  // ── Content attachment reads (node) ─────────────────────────────────────

  describe('getContent', () => {
    it('delegates to runtime getContent via callInternalRuntimeMethod', async () => {
      const result = await app.getContent('node:1');

      expect(mockRuntime.getContent).toHaveBeenCalledWith('node:1');
      expect(result).toEqual(new Uint8Array([1, 2, 3]));
    });
  });

  describe('getContentStream', () => {
    it('delegates to runtime getContentStream', async () => {
      const result = await app.getContentStream('node:1');

      expect(mockRuntime.getContentStream).toHaveBeenCalledWith('node:1');
      expect(result).toBeDefined();
    });
  });

  describe('getContentOid', () => {
    it('delegates to runtime getContentOid', async () => {
      const result = await app.getContentOid('node:1');

      expect(mockRuntime.getContentOid).toHaveBeenCalledWith('node:1');
      expect(result).toBe('a'.repeat(40));
    });
  });

  describe('getContentMeta', () => {
    it('delegates to runtime getContentMeta', async () => {
      const result = await app.getContentMeta('node:1');

      expect(mockRuntime.getContentMeta).toHaveBeenCalledWith('node:1');
      expect(result).toEqual({ oid: 'a'.repeat(40), mime: 'text/plain', size: 42 });
    });
  });

  // ── Content attachment reads (edge) ─────────────────────────────────────

  describe('getEdgeContent', () => {
    it('delegates to runtime getEdgeContent', async () => {
      const result = await app.getEdgeContent('a', 'b', 'knows');

      expect(mockRuntime.getEdgeContent).toHaveBeenCalledWith('a', 'b', 'knows');
      expect(result).toEqual(new Uint8Array([4, 5, 6]));
    });
  });

  describe('getEdgeContentStream', () => {
    it('delegates to runtime getEdgeContentStream', async () => {
      const result = await app.getEdgeContentStream('a', 'b', 'knows');

      expect(mockRuntime.getEdgeContentStream).toHaveBeenCalledWith('a', 'b', 'knows');
      expect(result).toBeDefined();
    });
  });

  describe('getEdgeContentOid', () => {
    it('delegates to runtime getEdgeContentOid', async () => {
      const result = await app.getEdgeContentOid('a', 'b', 'knows');

      expect(mockRuntime.getEdgeContentOid).toHaveBeenCalledWith('a', 'b', 'knows');
      expect(result).toBe('b'.repeat(40));
    });
  });

  describe('getEdgeContentMeta', () => {
    it('delegates to runtime getEdgeContentMeta', async () => {
      const result = await app.getEdgeContentMeta('a', 'b', 'knows');

      expect(mockRuntime.getEdgeContentMeta).toHaveBeenCalledWith('a', 'b', 'knows');
      expect(result).toEqual({ oid: 'b'.repeat(40), mime: null, size: 10 });
    });
  });

  // ── Strand delegation ───────────────────────────────────────────────────

  describe('createStrand', () => {
    it('delegates to core().createStrand()', async () => {
      const opts = { strandId: 'alpha' };
      const result = await app.createStrand(opts);

      expect(mockCore.createStrand).toHaveBeenCalledWith(opts);
      expect(result).toEqual({ strandId: 's1' });
    });
  });

  describe('getStrand', () => {
    it('delegates to core().getStrand()', async () => {
      const result = await app.getStrand('s1');

      expect(mockCore.getStrand).toHaveBeenCalledWith('s1');
      expect(result).toEqual({ strandId: 's1' });
    });
  });

  describe('listStrands', () => {
    it('delegates to core().listStrands()', async () => {
      const result = await app.listStrands();

      expect(mockCore.listStrands).toHaveBeenCalledWith();
      expect(result).toEqual([{ strandId: 's1' }]);
    });
  });

  describe('braidStrand', () => {
    it('delegates to core().braidStrand()', async () => {
      const opts = { writable: false };
      const result = await app.braidStrand('s1', opts);

      expect(mockCore.braidStrand).toHaveBeenCalledWith('s1', opts);
      expect(result).toEqual({ strandId: 's1' });
    });
  });

  describe('dropStrand', () => {
    it('delegates to core().dropStrand()', async () => {
      const result = await app.dropStrand('s1');

      expect(mockCore.dropStrand).toHaveBeenCalledWith('s1');
      expect(result).toBe(true);
    });
  });

  describe('createStrandPatch', () => {
    it('delegates to core().createStrandPatch()', async () => {
      const result = await app.createStrandPatch('s1');

      expect(mockCore.createStrandPatch).toHaveBeenCalledWith('s1');
      expect(result).toEqual({ addNode: expect.any(Function) });
    });
  });

  describe('patchStrand', () => {
    it('delegates to core().patchStrand()', async () => {
      const buildFn = vi.fn();
      const result = await app.patchStrand('s1', buildFn);

      expect(mockCore.patchStrand).toHaveBeenCalledWith('s1', buildFn);
      expect(result).toBe('sha-strand');
    });
  });

  describe('queueStrandIntent', () => {
    it('delegates to core().queueStrandIntent()', async () => {
      const buildFn = vi.fn();
      const result = await app.queueStrandIntent('s1', buildFn);

      expect(mockCore.queueStrandIntent).toHaveBeenCalledWith('s1', buildFn);
      expect(result).toEqual({ intentId: 'i1' });
    });
  });

  describe('listStrandIntents', () => {
    it('delegates to core().listStrandIntents()', async () => {
      const result = await app.listStrandIntents('s1');

      expect(mockCore.listStrandIntents).toHaveBeenCalledWith('s1');
      expect(result).toEqual([{ intentId: 'i1' }]);
    });
  });

  describe('tickStrand', () => {
    it('delegates to core().tickStrand()', async () => {
      const result = await app.tickStrand('s1');

      expect(mockCore.tickStrand).toHaveBeenCalledWith('s1');
      expect(result).toEqual({ tickId: 't1' });
    });
  });
});
