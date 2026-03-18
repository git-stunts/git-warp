import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../bin/cli/shared.js', () => ({
  openGraph: vi.fn(),
}));

const { openGraph } = await import('../../../../bin/cli/shared.js');
const handleWorkingSet = (await import('../../../../bin/cli/commands/working-set.js')).default;

describe('handleWorkingSet working-set braid command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes braid support overlays and writable mode through to the substrate surface', async () => {
    const braidWorkingSet = vi.fn().mockResolvedValue({
      workingSetId: 'ws_target',
      overlay: {
        overlayId: 'ws_target',
        kind: 'patch-log',
        headPatchSha: null,
        patchCount: 0,
        writable: false,
      },
      braid: {
        readOverlays: [
          {
            workingSetId: 'ws_support',
            overlayId: 'ws_support',
            kind: 'patch-log',
            headPatchSha: 'a'.repeat(40),
            patchCount: 1,
          },
        ],
      },
    });

    /** @type {any} */ (openGraph).mockResolvedValue({
      graph: { braidWorkingSet },
      graphName: 'demo',
    });

    const result = await handleWorkingSet({
      options: /** @type {any} */ ({ repo: '.', graph: 'demo', writer: 'cli' }),
      args: ['braid', 'ws_target', '--support', 'ws_support', '--read-only'],
    });

    expect(braidWorkingSet).toHaveBeenCalledWith('ws_target', {
      braidedWorkingSetIds: ['ws_support'],
      writable: false,
    });
    expect(result.payload).toMatchObject({
      graph: 'demo',
      workingSetAction: 'braid',
      workingSet: {
        workingSetId: 'ws_target',
      },
    });
  });

  it('rejects conflicting braid writability flags', async () => {
    await expect(handleWorkingSet({
      options: /** @type {any} */ ({ repo: '.', graph: 'demo', writer: 'cli' }),
      args: ['braid', 'ws_target', '--read-only', '--writable'],
    })).rejects.toThrow(/mutually exclusive/);
  });

  it('passes deterministic transfer-plan target selection through to the substrate surface', async () => {
    const planWorkingSetTransfer = vi.fn().mockResolvedValue({
      transferVersion: 'coordinate-transfer-plan/v1',
      transferDigest: 'transfer:123',
      comparisonDigest: 'comparison:123',
      changed: true,
      source: {
        requested: { kind: 'working_set', workingSetId: 'ws_target' },
        resolved: {
          coordinateKind: 'working_set',
          summary: { patchCount: 2, nodeCount: 2, edgeCount: 0, nodePropertyCount: 2, edgePropertyCount: 0 },
        },
      },
      target: {
        requested: { kind: 'live' },
        resolved: {
          coordinateKind: 'frontier',
          summary: { patchCount: 1, nodeCount: 1, edgeCount: 0, nodePropertyCount: 1, edgePropertyCount: 0 },
        },
      },
      summary: {
        opCount: 2,
        addNodeCount: 1,
        removeNodeCount: 0,
        setNodePropertyCount: 1,
        clearNodePropertyCount: 0,
        addEdgeCount: 0,
        removeEdgeCount: 0,
        setEdgePropertyCount: 0,
        clearEdgePropertyCount: 0,
        attachNodeContentCount: 0,
        clearNodeContentCount: 0,
        attachEdgeContentCount: 0,
        clearEdgeContentCount: 0,
      },
      ops: [],
    });

    /** @type {any} */ (openGraph).mockResolvedValue({
      graph: { planWorkingSetTransfer },
      graphName: 'demo',
    });

    const result = await handleWorkingSet({
      options: /** @type {any} */ ({ repo: '.', graph: 'demo', writer: 'cli' }),
      args: ['transfer-plan', 'ws_target', '--into', 'working-set:ws_live_candidate', '--lamport-ceiling', '12', '--into-lamport-ceiling', '8'],
    });

    expect(planWorkingSetTransfer).toHaveBeenCalledWith('ws_target', {
      into: {
        kind: 'working_set',
        workingSetId: 'ws_live_candidate',
      },
      ceiling: 12,
      intoCeiling: 8,
    });
    expect(result.payload).toMatchObject({
      graph: 'demo',
      workingSetAction: 'transfer-plan',
      workingSetId: 'ws_target',
      into: 'working-set:ws_live_candidate',
      transferPlan: {
        transferDigest: 'transfer:123',
      },
    });
  });
});
