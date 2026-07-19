import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createInterface: vi.fn(),
  openGraph: vi.fn(),
  readCliPackageVersion: vi.fn(),
}));

vi.mock('node:readline', () => ({
  default: { createInterface: mocks.createInterface },
}));

vi.mock('../../../../bin/cli/shared.ts', () => ({
  openGraph: mocks.openGraph,
  readCliPackageVersion: mocks.readCliPackageVersion,
}));

const handleMcp = (await import('../../../../bin/cli/commands/mcp.ts')).default;

describe('MCP command lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.openGraph.mockResolvedValue({ graph: {} });
    mocks.readCliPackageVersion.mockReturnValue('19.0.0-test');
  });

  it('propagates readline errors through completion after closing input', async () => {
    const lines = new EventEmitter() as EventEmitter & {
      close: ReturnType<typeof vi.fn>;
    };
    lines.close = vi.fn(() => lines.emit('close'));
    mocks.createInterface.mockReturnValue(lines);
    const inputFailure = new Error('stdin failed');

    const result = await handleMcp({
      options: { repo: '.', graph: 'demo', writer: 'cli' } as Parameters<
        typeof handleMcp
      >[0]['options'],
      args: [],
    });
    lines.emit('error', inputFailure);

    await expect(result.completion).rejects.toMatchObject({
      errors: [inputFailure],
    });
    expect(lines.close).toHaveBeenCalledOnce();
  });
});
