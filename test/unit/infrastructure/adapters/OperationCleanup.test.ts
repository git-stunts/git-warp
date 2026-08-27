import { describe, expect, it, vi } from 'vitest';
import {
  completeCleanupSteps,
  completeWithCleanup,
} from '../../../../src/infrastructure/adapters/OperationCleanup.ts';

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

describe('completeCleanupSteps', () => {
  it('normalizes non-Error rejections and continues ordered cleanup', async () => {
    const laterCleanup = vi.fn().mockResolvedValue(undefined);

    await expect(completeCleanupSteps([
      vi.fn().mockRejectedValue('non-Error cleanup rejection'),
      laterCleanup,
    ], 'cleanup failed')).rejects.toMatchObject({
      code: 'E_OPERATION_CLEANUP_REJECTION',
    });

    expect(laterCleanup).toHaveBeenCalledOnce();
  });

  it('attempts every step in order and preserves failure order', async () => {
    const firstFailure = new Error('first cleanup failed');
    const secondFailure = new Error('second cleanup failed');
    const events: string[] = [];

    await expect(completeCleanupSteps([
      async () => {
        events.push('first');
        throw firstFailure;
      },
      async () => {
        events.push('second');
        throw secondFailure;
      },
      async () => {
        events.push('third');
      },
    ], 'cleanup failed')).rejects.toMatchObject({
      errors: [firstFailure, secondFailure],
    });

    expect(events).toEqual(['first', 'second', 'third']);
  });
});
