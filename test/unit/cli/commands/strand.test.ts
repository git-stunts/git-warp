import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../bin/cli/shared.js', () => ({
  openGraph: vi.fn(),
}));

const { openGraph } = await import('../../../../bin/cli/shared.js');
const handleStrand = (await import('../../../../bin/cli/commands/strand.js')).default;

describe('handleStrand strand braid command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes braid support overlays and writable mode through to the substrate surface', async () => {
    const braidStrand = vi.fn().mockResolvedValue({
      strandId: 'ws_target',
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
            strandId: 'ws_support',
            overlayId: 'ws_support',
            kind: 'patch-log',
            headPatchSha: 'a'.repeat(40),
            patchCount: 1,
          },
        ],
      },
    });

    (openGraph).mockResolvedValue({
      graph: { braidStrand },
      graphName: 'demo',
    });

    const result = await handleStrand({
      options: ({ repo: '.', graph: 'demo', writer: 'cli' } as any),
      args: ['braid', 'ws_target', '--support', 'ws_support', '--read-only'],
    });

    expect(braidStrand).toHaveBeenCalledWith('ws_target', {
      braidedStrandIds: ['ws_support'],
      writable: false,
    });
    expect(result.payload).toMatchObject({
      graph: 'demo',
      strandAction: 'braid',
      strand: {
        strandId: 'ws_target',
      },
    });
  });

  it('rejects conflicting braid writability flags', async () => {
    await expect(handleStrand({
      options: ({ repo: '.', graph: 'demo', writer: 'cli' } as any),
      args: ['braid', 'ws_target', '--read-only', '--writable'],
    })).rejects.toThrow(/mutually exclusive/);
  });

  it('passes deterministic transfer-plan target selection through to the substrate surface', async () => {
    const planStrandTransfer = vi.fn().mockResolvedValue({
      transferVersion: 'coordinate-transfer-plan/v1',
      transferDigest: 'transfer:123',
      comparisonDigest: 'comparison:123',
      changed: true,
      source: {
        requested: { kind: 'strand', strandId: 'ws_target' },
        resolved: {
          coordinateKind: 'strand',
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

    (openGraph).mockResolvedValue({
      graph: { planStrandTransfer },
      graphName: 'demo',
    });

    const result = await handleStrand({
      options: ({ repo: '.', graph: 'demo', writer: 'cli' } as any),
      args: ['transfer-plan', 'ws_target', '--into', 'strand:ws_live_candidate', '--lamport-ceiling', '12', '--into-lamport-ceiling', '8'],
    });

    expect(planStrandTransfer).toHaveBeenCalledWith('ws_target', {
      into: {
        kind: 'strand',
        strandId: 'ws_live_candidate',
      },
      ceiling: 12,
      intoCeiling: 8,
    });
    expect(result.payload).toMatchObject({
      graph: 'demo',
      strandAction: 'transfer-plan',
      strandId: 'ws_target',
      into: 'strand:ws_live_candidate',
      transferPlan: {
        transferDigest: 'transfer:123',
      },
    });
  });
});
