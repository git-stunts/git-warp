import { describe, expect, it, vi } from 'vitest';
import { completeWithCleanup } from '../../../../src/infrastructure/adapters/OperationCleanup.ts';

describe('completeWithCleanup', () => {
  it('returns the operation value after cleanup', async () => {
    const events: string[] = [];

    const result = await completeWithCleanup(
      async () => {
        events.push('operation');
        return 'value';
      },
      async () => {
        events.push('cleanup');
      },
      'both failed',
    );

    expect(result).toBe('value');
    expect(events).toEqual(['operation', 'cleanup']);
  });

  it('preserves an operation failure after cleanup succeeds', async () => {
    const operationFailure = new Error('operation failed');
    const cleanup = vi.fn().mockResolvedValue(undefined);

    await expect(completeWithCleanup(
      vi.fn().mockRejectedValue(operationFailure),
      cleanup,
      'both failed',
    )).rejects.toBe(operationFailure);
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('reports a cleanup failure after the operation succeeds', async () => {
    const cleanupFailure = new Error('cleanup failed');

    await expect(completeWithCleanup(
      vi.fn().mockResolvedValue('value'),
      vi.fn().mockRejectedValue(cleanupFailure),
      'both failed',
    )).rejects.toBe(cleanupFailure);
  });

  it('aggregates operation and cleanup failures', async () => {
    const operationFailure = new Error('operation failed');
    const cleanupFailure = new Error('cleanup failed');

    await expect(completeWithCleanup(
      vi.fn().mockRejectedValue(operationFailure),
      vi.fn().mockRejectedValue(cleanupFailure),
      'both failed',
    )).rejects.toMatchObject({
      message: 'both failed',
      errors: [operationFailure, cleanupFailure],
    });
  });
});
