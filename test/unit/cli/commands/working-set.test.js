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
});
