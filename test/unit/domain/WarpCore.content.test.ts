import { describe, it, expect, vi, beforeEach } from 'vitest';
import WarpCore from '../../../src/domain/WarpCore.ts';
import CryptoPort from '../../../src/ports/CryptoPort.ts';
import { LIVE_LENS } from '../../../src/domain/types/ExternalizationPolicy.ts';
import type { EffectPipeline } from '../../../src/domain/services/EffectPipeline.ts';

// ── Mock structural core surface that WarpCore._adopt() can wrap ────────────

/**
 * Build a mock core surface where content methods live on the product object
 * itself. This ensures WarpCore adopts an explicit structural surface instead
 * of relying on prototype walking.
 */
function createMockCoreSurfaceForAdopt() {
  let effectPipeline: EffectPipeline | null = null;
  const crypto = new TestCryptoPort();
  return {
    getContent: vi.fn(async () => new Uint8Array([1, 2, 3])),
    getContentStream: vi.fn(async () => (async function* () { yield new Uint8Array([1]); })()),
    getContentOid: vi.fn(async () => 'a'.repeat(40)),
    getContentMeta: vi.fn(async () => ({ oid: 'a'.repeat(40), mime: 'text/plain', size: 42 })),
    getEdgeContent: vi.fn(async () => new Uint8Array([4, 5, 6])),
    getEdgeContentStream: vi.fn(async () => (async function* () { yield new Uint8Array([2]); })()),
    getEdgeContentOid: vi.fn(async () => 'b'.repeat(40)),
    getEdgeContentMeta: vi.fn(async () => ({ oid: 'b'.repeat(40), mime: null, size: 10 })),
    get _effectPipeline() {
      return effectPipeline;
    },
    set _effectPipeline(pipeline: EffectPipeline | null) {
      effectPipeline = pipeline;
    },
    get _crypto() {
      return crypto;
    },
  };
}

class TestCryptoPort extends CryptoPort {
  async hash(): Promise<string> {
    return 'hash';
  }

  async hmac(): Promise<Uint8Array> {
    return new Uint8Array([1]);
  }

  timingSafeEqual(): boolean {
    return true;
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WarpCore', () => {
  // ── _adopt ──────────────────────────────────────────────────────────────

  describe('_adopt', () => {
    it('returns the same instance if already a WarpCore', () => {
      const core = WarpCore._adopt(createMockCoreSurfaceForAdopt());
      expect(core).toBeInstanceOf(WarpCore);

      const readopted = WarpCore._adopt(core);
      expect(readopted).toBe(core);
    });

    it('sets prototype to WarpCore.prototype for a structural core surface', () => {
      const surface = createMockCoreSurfaceForAdopt();
      expect(surface).not.toBeInstanceOf(WarpCore);

      const core = WarpCore._adopt(surface);

      expect(core).toBeInstanceOf(WarpCore);
      expect(core).toBe(surface);
    });

    it('throws when surface adoption cannot install the WarpCore prototype', () => {
      const surface = createMockCoreSurfaceForAdopt();
      const setPrototypeOf = vi.spyOn(Object, 'setPrototypeOf').mockImplementation((value) => value);

      expect(() => WarpCore._adopt(surface)).toThrow('failed to adopt runtime as WarpCore');

      setPrototypeOf.mockRestore();
    });
  });

  // ── Content attachment reads (node) ─────────────────────────────────────

  describe('content methods (node)', () => {
        let core;
    let surface;

    beforeEach(() => {
      surface = createMockCoreSurfaceForAdopt();
      core = WarpCore._adopt(surface);
    });

    it('getContent delegates to the adopted surface method', async () => {
      const result = await core.getContent('node:1');

      expect(surface.getContent).toHaveBeenCalledWith('node:1');
      expect(result).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('getContent returns null when content is absent', async () => {
      surface.getContent.mockResolvedValue(null);

      const result = await core.getContent('missing');
      expect(result).toBeNull();
    });

    it('getContentStream delegates to the adopted surface method', async () => {
      const result = await core.getContentStream('node:1');

      expect(surface.getContentStream).toHaveBeenCalledWith('node:1');
      expect(result).toBeDefined();
    });

    it('getContentOid delegates to the adopted surface method', async () => {
      const result = await core.getContentOid('node:1');

      expect(surface.getContentOid).toHaveBeenCalledWith('node:1');
      expect(result).toBe('a'.repeat(40));
    });

    it('getContentMeta delegates to the adopted surface method', async () => {
      const result = await core.getContentMeta('node:1');

      expect(surface.getContentMeta).toHaveBeenCalledWith('node:1');
      expect(result).toEqual({ oid: 'a'.repeat(40), mime: 'text/plain', size: 42 });
    });
  });

  // ── Content attachment reads (edge) ─────────────────────────────────────

  describe('content methods (edge)', () => {
        let core;
    let surface;

    beforeEach(() => {
      surface = createMockCoreSurfaceForAdopt();
      core = WarpCore._adopt(surface);
    });

    it('getEdgeContent delegates to the adopted surface method', async () => {
      const result = await core.getEdgeContent('a', 'b', 'knows');

      expect(surface.getEdgeContent).toHaveBeenCalledWith('a', 'b', 'knows');
      expect(result).toEqual(new Uint8Array([4, 5, 6]));
    });

    it('getEdgeContentStream delegates to the adopted surface method', async () => {
      const result = await core.getEdgeContentStream('a', 'b', 'knows');

      expect(surface.getEdgeContentStream).toHaveBeenCalledWith('a', 'b', 'knows');
      expect(result).toBeDefined();
    });

    it('getEdgeContentOid delegates to the adopted surface method', async () => {
      const result = await core.getEdgeContentOid('a', 'b', 'knows');

      expect(surface.getEdgeContentOid).toHaveBeenCalledWith('a', 'b', 'knows');
      expect(result).toBe('b'.repeat(40));
    });

    it('getEdgeContentMeta delegates to the adopted surface method', async () => {
      const result = await core.getEdgeContentMeta('a', 'b', 'knows');

      expect(surface.getEdgeContentMeta).toHaveBeenCalledWith('a', 'b', 'knows');
      expect(result).toEqual({ oid: 'b'.repeat(40), mime: null, size: 10 });
    });
  });

  // ── Effect pipeline accessors ───────────────────────────────────────────

  describe('effect pipeline', () => {
    it('effectPipeline getter returns null when no pipeline configured', () => {
      const core = WarpCore._adopt(createMockCoreSurfaceForAdopt());
      expect(core.effectPipeline).toBeNull();
    });

    it('effectEmissions returns empty array when no pipeline', () => {
      const core = WarpCore._adopt(createMockCoreSurfaceForAdopt());
      expect(core.effectEmissions).toEqual([]);
    });

    it('deliveryObservations returns empty array when no pipeline', () => {
      const core = WarpCore._adopt(createMockCoreSurfaceForAdopt());
      expect(core.deliveryObservations).toEqual([]);
    });

    it('externalizationPolicy returns null when no pipeline', () => {
      const core = WarpCore._adopt(createMockCoreSurfaceForAdopt());
      expect(core.externalizationPolicy).toBeNull();
    });

    it('externalizationPolicy setter is no-op when no pipeline', () => {
      const core = WarpCore._adopt(createMockCoreSurfaceForAdopt());
      core.externalizationPolicy = LIVE_LENS;
      expect(core.externalizationPolicy).toBeNull();
    });
  });
});
