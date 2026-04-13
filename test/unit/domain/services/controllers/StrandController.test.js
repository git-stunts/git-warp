import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCoordinator = {
  create: vi.fn(),
  braid: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  drop: vi.fn(),
  materialize: vi.fn(),
  getPatchEntries: vi.fn(),
  patchesFor: vi.fn(),
  createPatchBuilder: vi.fn(),
  patch: vi.fn(),
  queueIntent: vi.fn(),
  listIntents: vi.fn(),
  tick: vi.fn(),
  getOrThrow: vi.fn(),
};

vi.mock(
  '../../../../../src/domain/services/strand/createStrandCoordinator.ts',
  () => ({
    default: vi.fn(() => mockCoordinator),
  }),
);

vi.mock(
  '../../../../../src/domain/services/strand/ConflictAnalyzerService.ts',
  () => {
    const MockConflictAnalyzerService = vi.fn();
    MockConflictAnalyzerService.prototype.analyze = vi.fn();
    return { default: MockConflictAnalyzerService };
  },
);

const { default: StrandController } = await import(
  '../../../../../src/domain/services/controllers/StrandController.js'
);
const { default: createStrandCoordinator } = await import(
  '../../../../../src/domain/services/strand/createStrandCoordinator.ts'
);

describe('StrandController', () => {
  /** @type {any} */
  let host;
  /** @type {InstanceType<typeof StrandController>} */
  let controller;

  beforeEach(() => {
    vi.clearAllMocks();
    host = { _graphName: 'test', _persistence: {}, _clock: {}, _crypto: {} };
    controller = new StrandController(host);
  });

  describe('construction', () => {
    it('creates a coordinator via createStrandCoordinator', () => {
      expect(createStrandCoordinator).toHaveBeenCalled();
    });
  });

  describe('strand lifecycle', () => {
    it('delegates createStrand to coordinator.create', async () => {
      const expected = { strandId: 's1' };
      mockCoordinator.create.mockResolvedValue(expected);
      const result = await controller.createStrand({ strandId: 's1' });
      expect(mockCoordinator.create).toHaveBeenCalledWith({ strandId: 's1' });
      expect(result).toBe(expected);
    });

    it('delegates braidStrand to coordinator.braid', async () => {
      const expected = { strandId: 's1' };
      mockCoordinator.braid.mockResolvedValue(expected);
      const result = await controller.braidStrand('s1', /** @type {any} */ ({ squash: true }));
      expect(mockCoordinator.braid).toHaveBeenCalledWith('s1', { squash: true });
      expect(result).toBe(expected);
    });

    it('delegates getStrand to coordinator.get', async () => {
      const descriptor = { strandId: 's1' };
      mockCoordinator.get.mockResolvedValue(descriptor);
      const result = await controller.getStrand('s1');
      expect(mockCoordinator.get).toHaveBeenCalledWith('s1');
      expect(result).toBe(descriptor);
    });

    it('returns null when strand does not exist', async () => {
      mockCoordinator.get.mockResolvedValue(null);
      const result = await controller.getStrand('missing');
      expect(result).toBeNull();
    });

    it('delegates listStrands to coordinator.list', async () => {
      const strands = [{ strandId: 's1' }];
      mockCoordinator.list.mockResolvedValue(strands);
      const result = await controller.listStrands();
      expect(mockCoordinator.list).toHaveBeenCalledWith();
      expect(result).toBe(strands);
    });

    it('delegates dropStrand to coordinator.drop', async () => {
      mockCoordinator.drop.mockResolvedValue(true);
      const result = await controller.dropStrand('s1');
      expect(mockCoordinator.drop).toHaveBeenCalledWith('s1');
      expect(result).toBe(true);
    });
  });

  describe('materialization', () => {
    it('delegates materializeStrand to coordinator.materialize', async () => {
      const state = { nodes: [] };
      mockCoordinator.materialize.mockResolvedValue(state);
      const result = await controller.materializeStrand('s1', { receipts: true });
      expect(mockCoordinator.materialize).toHaveBeenCalledWith('s1', { receipts: true });
      expect(result).toBe(state);
    });
  });

  describe('patch entries', () => {
    it('delegates getStrandPatches to coordinator.getPatchEntries', async () => {
      const entries = [{ patch: {}, sha: 'abc' }];
      mockCoordinator.getPatchEntries.mockResolvedValue(entries);
      const result = await controller.getStrandPatches('s1', { ceiling: 5 });
      expect(mockCoordinator.getPatchEntries).toHaveBeenCalledWith('s1', { ceiling: 5 });
      expect(result).toBe(entries);
    });

    it('delegates patchesForStrand to coordinator.patchesFor', async () => {
      const shas = ['sha1'];
      mockCoordinator.patchesFor.mockResolvedValue(shas);
      const result = await controller.patchesForStrand('s1', 'node:1', { ceiling: 3 });
      expect(mockCoordinator.patchesFor).toHaveBeenCalledWith('s1', 'node:1', { ceiling: 3 });
      expect(result).toBe(shas);
    });
  });

  describe('patching', () => {
    it('delegates createStrandPatch to coordinator.createPatchBuilder', async () => {
      const builder = {};
      mockCoordinator.createPatchBuilder.mockResolvedValue(builder);
      const result = await controller.createStrandPatch('s1');
      expect(mockCoordinator.createPatchBuilder).toHaveBeenCalledWith('s1');
      expect(result).toBe(builder);
    });

    it('delegates patchStrand to coordinator.patch', async () => {
      const buildFn = vi.fn();
      mockCoordinator.patch.mockResolvedValue('sha-abc');
      const result = await controller.patchStrand('s1', buildFn);
      expect(mockCoordinator.patch).toHaveBeenCalledWith('s1', buildFn);
      expect(result).toBe('sha-abc');
    });
  });

  describe('intents', () => {
    it('delegates queueStrandIntent to coordinator.queueIntent', async () => {
      const buildFn = vi.fn();
      const intent = { intentId: 'i1' };
      mockCoordinator.queueIntent.mockResolvedValue(intent);
      const result = await controller.queueStrandIntent('s1', buildFn);
      expect(mockCoordinator.queueIntent).toHaveBeenCalledWith('s1', buildFn);
      expect(result).toBe(intent);
    });

    it('delegates listStrandIntents to coordinator.listIntents', async () => {
      const intents = [{ intentId: 'i1' }];
      mockCoordinator.listIntents.mockResolvedValue(intents);
      const result = await controller.listStrandIntents('s1');
      expect(mockCoordinator.listIntents).toHaveBeenCalledWith('s1');
      expect(result).toBe(intents);
    });

    it('delegates tickStrand to coordinator.tick', async () => {
      const tickResult = { tickId: 't1' };
      mockCoordinator.tick.mockResolvedValue(tickResult);
      const result = await controller.tickStrand('s1');
      expect(mockCoordinator.tick).toHaveBeenCalledWith('s1');
      expect(result).toBe(tickResult);
    });
  });
});
