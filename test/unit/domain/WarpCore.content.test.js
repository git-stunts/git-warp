import { describe, it, expect, vi, beforeEach } from 'vitest';
import WarpCore from '../../../src/domain/WarpCore.js';

// ── Mock runtime that WarpCore._adopt() can wrap ─────────────────────────────

/**
 * Build a mock runtime where content methods live on the prototype (simulating
 * WarpRuntime's defineProperty-installed QueryController methods). This ensures
 * callInternalRuntimeMethod walks the prototype chain through WarpCore.prototype
 * and resolves to the grandparent (simulated WarpRuntime.prototype) methods.
 */
function createMockRuntimeForAdopt() {
  // Build a fake WarpRuntime prototype with content methods
  const fakeRuntimeProto = {
    getContent: vi.fn(async () => new Uint8Array([1, 2, 3])),
    getContentStream: vi.fn(async () => (async function* () { yield new Uint8Array([1]); })()),
    getContentOid: vi.fn(async () => 'a'.repeat(40)),
    getContentMeta: vi.fn(async () => ({ oid: 'a'.repeat(40), mime: 'text/plain', size: 42 })),
    getEdgeContent: vi.fn(async () => new Uint8Array([4, 5, 6])),
    getEdgeContentStream: vi.fn(async () => (async function* () { yield new Uint8Array([2]); })()),
    getEdgeContentOid: vi.fn(async () => 'b'.repeat(40)),
    getEdgeContentMeta: vi.fn(async () => ({ oid: 'b'.repeat(40), mime: null, size: 10 })),
  };

  // The runtime instance has NO own content methods — they're on its prototype.
  // But WarpRuntime.prototype content methods delegate to _queryController,
  // so we mock that controller with the same spies.
  const runtime = Object.create(fakeRuntimeProto);
  runtime._effectPipeline = null;
  runtime._queryController = {
    getContent: fakeRuntimeProto.getContent,
    getContentStream: fakeRuntimeProto.getContentStream,
    getContentOid: fakeRuntimeProto.getContentOid,
    getContentMeta: fakeRuntimeProto.getContentMeta,
    getEdgeContent: fakeRuntimeProto.getEdgeContent,
    getEdgeContentStream: fakeRuntimeProto.getEdgeContentStream,
    getEdgeContentOid: fakeRuntimeProto.getEdgeContentOid,
    getEdgeContentMeta: fakeRuntimeProto.getEdgeContentMeta,
  };
  return runtime;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WarpCore', () => {
  // ── _adopt ──────────────────────────────────────────────────────────────

  describe('_adopt', () => {
    it('returns the same instance if already a WarpCore', () => {
      // Create a minimal WarpCore-like instance by adopting a mock runtime first
      const core = WarpCore._adopt(createMockRuntimeForAdopt());
      expect(core).toBeInstanceOf(WarpCore);

      // Now adopt the same WarpCore — should return it unchanged
      const readopted = WarpCore._adopt(core);
      expect(readopted).toBe(core);
    });

    it('sets prototype to WarpCore.prototype for non-WarpCore runtime', () => {
      const runtime = createMockRuntimeForAdopt();
      expect(runtime).not.toBeInstanceOf(WarpCore);

      const core = WarpCore._adopt(runtime);

      expect(core).toBeInstanceOf(WarpCore);
      // Verify the original object was mutated, not cloned
      expect(core).toBe(runtime);
    });
  });

  // ── Content attachment reads (node) ─────────────────────────────────────

  describe('content methods (node)', () => {
    /** @type {WarpCore} */
    let core;
    let runtime;
    let runtimeProto;

    beforeEach(() => {
      runtime = createMockRuntimeForAdopt();
      runtimeProto = Object.getPrototypeOf(runtime);
      core = WarpCore._adopt(runtime);
    });

    it('getContent delegates to runtime prototype method', async () => {
      const result = await core.getContent('node:1');

      expect(runtimeProto.getContent).toHaveBeenCalledWith('node:1');
      expect(result).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('getContent returns null when content is absent', async () => {
      runtimeProto.getContent.mockResolvedValue(null);

      const result = await core.getContent('missing');
      expect(result).toBeNull();
    });

    it('getContentStream delegates to runtime prototype method', async () => {
      const result = await core.getContentStream('node:1');

      expect(runtimeProto.getContentStream).toHaveBeenCalledWith('node:1');
      expect(result).toBeDefined();
    });

    it('getContentOid delegates to runtime prototype method', async () => {
      const result = await core.getContentOid('node:1');

      expect(runtimeProto.getContentOid).toHaveBeenCalledWith('node:1');
      expect(result).toBe('a'.repeat(40));
    });

    it('getContentMeta delegates to runtime prototype method', async () => {
      const result = await core.getContentMeta('node:1');

      expect(runtimeProto.getContentMeta).toHaveBeenCalledWith('node:1');
      expect(result).toEqual({ oid: 'a'.repeat(40), mime: 'text/plain', size: 42 });
    });
  });

  // ── Content attachment reads (edge) ─────────────────────────────────────

  describe('content methods (edge)', () => {
    /** @type {WarpCore} */
    let core;
    let runtime;
    let runtimeProto;

    beforeEach(() => {
      runtime = createMockRuntimeForAdopt();
      runtimeProto = Object.getPrototypeOf(runtime);
      core = WarpCore._adopt(runtime);
    });

    it('getEdgeContent delegates to runtime prototype method', async () => {
      const result = await core.getEdgeContent('a', 'b', 'knows');

      expect(runtimeProto.getEdgeContent).toHaveBeenCalledWith('a', 'b', 'knows');
      expect(result).toEqual(new Uint8Array([4, 5, 6]));
    });

    it('getEdgeContentStream delegates to runtime prototype method', async () => {
      const result = await core.getEdgeContentStream('a', 'b', 'knows');

      expect(runtimeProto.getEdgeContentStream).toHaveBeenCalledWith('a', 'b', 'knows');
      expect(result).toBeDefined();
    });

    it('getEdgeContentOid delegates to runtime prototype method', async () => {
      const result = await core.getEdgeContentOid('a', 'b', 'knows');

      expect(runtimeProto.getEdgeContentOid).toHaveBeenCalledWith('a', 'b', 'knows');
      expect(result).toBe('b'.repeat(40));
    });

    it('getEdgeContentMeta delegates to runtime prototype method', async () => {
      const result = await core.getEdgeContentMeta('a', 'b', 'knows');

      expect(runtimeProto.getEdgeContentMeta).toHaveBeenCalledWith('a', 'b', 'knows');
      expect(result).toEqual({ oid: 'b'.repeat(40), mime: null, size: 10 });
    });
  });

  // ── Effect pipeline accessors ───────────────────────────────────────────

  describe('effect pipeline', () => {
    it('effectPipeline getter returns null when no pipeline configured', () => {
      const core = WarpCore._adopt(createMockRuntimeForAdopt());
      expect(core.effectPipeline).toBeNull();
    });

    it('effectEmissions returns empty array when no pipeline', () => {
      const core = WarpCore._adopt(createMockRuntimeForAdopt());
      expect(core.effectEmissions).toEqual([]);
    });

    it('deliveryObservations returns empty array when no pipeline', () => {
      const core = WarpCore._adopt(createMockRuntimeForAdopt());
      expect(core.deliveryObservations).toEqual([]);
    });

    it('externalizationPolicy returns null when no pipeline', () => {
      const core = WarpCore._adopt(createMockRuntimeForAdopt());
      expect(core.externalizationPolicy).toBeNull();
    });

    it('externalizationPolicy setter is no-op when no pipeline', () => {
      const core = WarpCore._adopt(createMockRuntimeForAdopt());
      // Should not throw
      core.externalizationPolicy = /** @type {any} */ ('LIVE_LENS');
      expect(core.externalizationPolicy).toBeNull();
    });
  });
});
