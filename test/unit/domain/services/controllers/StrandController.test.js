import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock(
  '../../../../../src/domain/services/strand/StrandService.js',
  () => {
    const MockStrandService = vi.fn();
    MockStrandService.prototype.create = vi.fn();
    MockStrandService.prototype.braid = vi.fn();
    MockStrandService.prototype.get = vi.fn();
    MockStrandService.prototype.list = vi.fn();
    MockStrandService.prototype.drop = vi.fn();
    MockStrandService.prototype.materialize = vi.fn();
    MockStrandService.prototype.getPatchEntries = vi.fn();
    MockStrandService.prototype.patchesFor = vi.fn();
    MockStrandService.prototype.createPatchBuilder = vi.fn();
    MockStrandService.prototype.patch = vi.fn();
    MockStrandService.prototype.queueIntent = vi.fn();
    MockStrandService.prototype.listIntents = vi.fn();
    MockStrandService.prototype.tick = vi.fn();
    return { default: MockStrandService };
  },
);

vi.mock(
  '../../../../../src/domain/services/strand/ConflictAnalyzerService.js',
  () => {
    const MockConflictAnalyzerService = vi.fn();
    MockConflictAnalyzerService.prototype.analyze = vi.fn();
    return { default: MockConflictAnalyzerService };
  },
);

/** @typedef {import('../../../../../src/domain/services/controllers/StrandController.js').default} StrandController */

const { default: StrandController } = await import(
  '../../../../../src/domain/services/controllers/StrandController.js'
);
const { default: StrandService } = await import(
  '../../../../../src/domain/services/strand/StrandService.js'
);
const { default: ConflictAnalyzerService } = await import(
  '../../../../../src/domain/services/strand/ConflictAnalyzerService.js'
);

describe('StrandController', () => {
  /** @type {StrandController} */
  let controller;
  const host = Object.freeze({ name: 'mock-host' });

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new StrandController(host);
  });

  // ── Constructor ──────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('creates a StrandService with the host as graph', () => {
      expect(StrandService).toHaveBeenCalledWith({ graph: host });
    });
  });

  // ── Strand lifecycle ─────────────────────────────────────────────────────

  describe('createStrand', () => {
    it('delegates to StrandService.create and forwards the result', async () => {
      const options = { writerId: 'w1' };
      const expected = { strandId: 's1' };
      StrandService.prototype.create.mockResolvedValue(expected);

      const result = await controller.createStrand(options);

      expect(StrandService.prototype.create).toHaveBeenCalledWith(options);
      expect(result).toBe(expected);
    });
  });

  describe('braidStrand', () => {
    it('delegates to StrandService.braid with strandId and options', async () => {
      const expected = { strandId: 's1', braided: true };
      StrandService.prototype.braid.mockResolvedValue(expected);

      const result = await controller.braidStrand('s1', { squash: true });

      expect(StrandService.prototype.braid).toHaveBeenCalledWith('s1', { squash: true });
      expect(result).toBe(expected);
    });
  });

  describe('getStrand', () => {
    it('delegates to StrandService.get', async () => {
      const descriptor = { strandId: 's1' };
      StrandService.prototype.get.mockResolvedValue(descriptor);

      const result = await controller.getStrand('s1');

      expect(StrandService.prototype.get).toHaveBeenCalledWith('s1');
      expect(result).toBe(descriptor);
    });

    it('returns null when strand does not exist', async () => {
      StrandService.prototype.get.mockResolvedValue(null);

      const result = await controller.getStrand('missing');

      expect(result).toBeNull();
    });
  });

  describe('listStrands', () => {
    it('delegates to StrandService.list', async () => {
      const strands = [{ strandId: 's1' }, { strandId: 's2' }];
      StrandService.prototype.list.mockResolvedValue(strands);

      const result = await controller.listStrands();

      expect(StrandService.prototype.list).toHaveBeenCalledWith();
      expect(result).toBe(strands);
    });
  });

  describe('dropStrand', () => {
    it('delegates to StrandService.drop', async () => {
      StrandService.prototype.drop.mockResolvedValue(true);

      const result = await controller.dropStrand('s1');

      expect(StrandService.prototype.drop).toHaveBeenCalledWith('s1');
      expect(result).toBe(true);
    });
  });

  // ── Strand materialization & queries ─────────────────────────────────────

  describe('materializeStrand', () => {
    it('delegates to StrandService.materialize with strandId and options', async () => {
      const state = { nodeAlive: new Map() };
      StrandService.prototype.materialize.mockResolvedValue(state);

      const result = await controller.materializeStrand('s1', { receipts: true });

      expect(StrandService.prototype.materialize).toHaveBeenCalledWith('s1', { receipts: true });
      expect(result).toBe(state);
    });
  });

  describe('getStrandPatches', () => {
    it('delegates to StrandService.getPatchEntries', async () => {
      const entries = [{ sha: 'abc', patch: {} }];
      StrandService.prototype.getPatchEntries.mockResolvedValue(entries);

      const result = await controller.getStrandPatches('s1', { ceiling: 5 });

      expect(StrandService.prototype.getPatchEntries).toHaveBeenCalledWith('s1', { ceiling: 5 });
      expect(result).toBe(entries);
    });
  });

  describe('patchesForStrand', () => {
    it('delegates to StrandService.patchesFor with strandId, entityId, and options', async () => {
      const shas = ['sha1', 'sha2'];
      StrandService.prototype.patchesFor.mockResolvedValue(shas);

      const result = await controller.patchesForStrand('s1', 'node:1', { ceiling: 3 });

      expect(StrandService.prototype.patchesFor).toHaveBeenCalledWith('s1', 'node:1', { ceiling: 3 });
      expect(result).toBe(shas);
    });
  });

  // ── Strand patching ─────────────────────────────────────────────────────

  describe('createStrandPatch', () => {
    it('delegates to StrandService.createPatchBuilder', async () => {
      const builder = { addNode: vi.fn() };
      StrandService.prototype.createPatchBuilder.mockResolvedValue(builder);

      const result = await controller.createStrandPatch('s1');

      expect(StrandService.prototype.createPatchBuilder).toHaveBeenCalledWith('s1');
      expect(result).toBe(builder);
    });
  });

  describe('patchStrand', () => {
    it('delegates to StrandService.patch with strandId and build callback', async () => {
      const buildFn = vi.fn();
      StrandService.prototype.patch.mockResolvedValue('sha-abc');

      const result = await controller.patchStrand('s1', buildFn);

      expect(StrandService.prototype.patch).toHaveBeenCalledWith('s1', buildFn);
      expect(result).toBe('sha-abc');
    });
  });

  // ── Speculative intents ─────────────────────────────────────────────────

  describe('queueStrandIntent', () => {
    it('delegates to StrandService.queueIntent', async () => {
      const buildFn = vi.fn();
      const intent = { intentId: 'i1', enqueuedAt: '2026-01-01' };
      StrandService.prototype.queueIntent.mockResolvedValue(intent);

      const result = await controller.queueStrandIntent('s1', buildFn);

      expect(StrandService.prototype.queueIntent).toHaveBeenCalledWith('s1', buildFn);
      expect(result).toBe(intent);
    });
  });

  describe('listStrandIntents', () => {
    it('delegates to StrandService.listIntents', async () => {
      const intents = [{ intentId: 'i1' }, { intentId: 'i2' }];
      StrandService.prototype.listIntents.mockResolvedValue(intents);

      const result = await controller.listStrandIntents('s1');

      expect(StrandService.prototype.listIntents).toHaveBeenCalledWith('s1');
      expect(result).toBe(intents);
    });
  });

  describe('tickStrand', () => {
    it('delegates to StrandService.tick', async () => {
      const tickResult = { tickId: 't1', strandId: 's1', tickIndex: 0 };
      StrandService.prototype.tick.mockResolvedValue(tickResult);

      const result = await controller.tickStrand('s1');

      expect(StrandService.prototype.tick).toHaveBeenCalledWith('s1');
      expect(result).toBe(tickResult);
    });
  });

  // ── Conflict analysis ───────────────────────────────────────────────────

  describe('analyzeConflicts', () => {
    it('creates a new ConflictAnalyzerService with the host and delegates to analyze', async () => {
      const analysis = { conflicts: [], version: 'v2' };
      ConflictAnalyzerService.prototype.analyze.mockResolvedValue(analysis);
      const options = { strandId: 's1', ceiling: 10 };

      const result = await controller.analyzeConflicts(options);

      expect(ConflictAnalyzerService).toHaveBeenCalledWith({ graph: host });
      expect(ConflictAnalyzerService.prototype.analyze).toHaveBeenCalledWith(options);
      expect(result).toBe(analysis);
    });

    it('creates a fresh ConflictAnalyzerService on every call', async () => {
      ConflictAnalyzerService.prototype.analyze.mockResolvedValue({ conflicts: [] });

      await controller.analyzeConflicts();
      await controller.analyzeConflicts();

      expect(ConflictAnalyzerService).toHaveBeenCalledTimes(2);
    });
  });
});
