import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EXIT_CODES } from '../../../bin/cli/infrastructure.js';

vi.mock('../../../bin/cli/shared.js', () => ({
  openGraph: vi.fn(),
  applyCursorCeiling: vi.fn().mockResolvedValue(null),
  emitCursorWarning: vi.fn(),
}));

const shared = await import('../../../bin/cli/shared.js');
const openGraph = /** @type {import('vitest').Mock} */ (/** @type {unknown} */ (shared.openGraph));
const applyCursorCeiling = /** @type {import('vitest').Mock} */ (/** @type {unknown} */ (shared.applyCursorCeiling));
const emitCursorWarning = /** @type {import('vitest').Mock} */ (/** @type {unknown} */ (shared.emitCursorWarning));
const { default: handleVerifyIndex } = await import('../../../bin/cli/commands/verify-index.js');

/** @type {import('../../../bin/cli/types.js').CliOptions} */
const CLI_OPTIONS = /** @type {*} */ ({
  repo: '/tmp/repo',
  graph: 'demo',
  json: true,
  ndjson: false,
  view: null,
  writer: 'cli',
  help: false,
});

describe('verify-index command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    applyCursorCeiling.mockResolvedValue(null);
  });

  it('maps known no-index errors to a stable operator-facing message', async () => {
    openGraph.mockResolvedValue({
      graphName: 'demo',
      persistence: {},
      graph: {
        materialize: vi.fn().mockResolvedValue(undefined),
        verifyIndex: vi.fn().mockRejectedValue(new Error('Cannot verify index: graph not materialized or index not built')),
      },
    });

    const result = await handleVerifyIndex({ options: CLI_OPTIONS, args: [] });

    expect(result.exitCode).toBe(EXIT_CODES.INTERNAL);
    expect(result.payload).toEqual({
      error: 'No bitmap index available after materialization',
    });
    expect(emitCursorWarning).toHaveBeenCalled();
  });

  it('preserves unexpected verifyIndex errors', async () => {
    openGraph.mockResolvedValue({
      graphName: 'demo',
      persistence: {},
      graph: {
        materialize: vi.fn().mockResolvedValue(undefined),
        verifyIndex: vi.fn().mockRejectedValue(new Error('simulated storage failure')),
      },
    });

    const result = await handleVerifyIndex({ options: CLI_OPTIONS, args: [] });

    expect(result.exitCode).toBe(EXIT_CODES.INTERNAL);
    expect(result.payload).toEqual({
      error: 'simulated storage failure',
    });
  });

  it('stringifies non-Error throws from materialize()', async () => {
    openGraph.mockResolvedValue({
      graphName: 'demo',
      persistence: {},
      graph: {
        materialize: vi.fn().mockRejectedValue('boom'),
        verifyIndex: vi.fn(),
      },
    });

    const result = await handleVerifyIndex({ options: CLI_OPTIONS, args: [] });

    expect(result.exitCode).toBe(EXIT_CODES.INTERNAL);
    expect(result.payload).toEqual({
      error: 'boom',
    });
  });

  it('returns OK when all sampled checks pass', async () => {
    openGraph.mockResolvedValue({
      graphName: 'demo',
      persistence: {},
      graph: {
        materialize: vi.fn().mockResolvedValue(undefined),
        verifyIndex: vi.fn().mockResolvedValue({ passed: 8, failed: 0, errors: [], seed: 7 }),
      },
    });

    const result = await handleVerifyIndex({ options: CLI_OPTIONS, args: ['--seed', '7'] });

    expect(result.exitCode).toBe(EXIT_CODES.OK);
    expect(result.payload).toMatchObject({
      graph: 'demo',
      passed: 8,
      failed: 0,
      seed: 7,
      totalChecks: 8,
    });
  });

  it('returns INTERNAL when mismatches are found', async () => {
    openGraph.mockResolvedValue({
      graphName: 'demo',
      persistence: {},
      graph: {
        materialize: vi.fn().mockResolvedValue(undefined),
        verifyIndex: vi.fn().mockResolvedValue({
          passed: 2,
          failed: 1,
          errors: [{ nodeId: 'A', direction: 'out', expected: ['x'], actual: ['y'] }],
          seed: 11,
        }),
      },
    });

    const result = await handleVerifyIndex({ options: CLI_OPTIONS, args: [] });

    expect(result.exitCode).toBe(EXIT_CODES.INTERNAL);
    expect(result.payload).toMatchObject({
      graph: 'demo',
      passed: 2,
      failed: 1,
      totalChecks: 3,
      seed: 11,
    });
  });
});
