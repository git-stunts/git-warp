import { describe, expect, it, vi } from 'vitest';
import { runAttachmentMemoryWitnessWithCleanup } from '../../performance/AttachmentMemoryWitnessCleanup.mjs';

describe('attachment memory witness cleanup', () => {
  it('attempts later cleanup even when the first close fails', async () => {
    const failure = new Error('storage close failed');
    const persistence = vi.fn(async () => undefined);
    const remove = vi.fn(async () => undefined);
    await expect(runAttachmentMemoryWitnessWithCleanup(async () => undefined, [
      async () => { throw failure; }, persistence, remove,
    ])).rejects.toBe(failure);
    expect(persistence).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
  });

  it('preserves the operation failure alongside cleanup failures', async () => {
    const primary = new Error('stream failed');
    const cleanup = new Error('storage close failed');
    const remove = vi.fn(async () => undefined);
    await expect(runAttachmentMemoryWitnessWithCleanup(async () => { throw primary; }, [
      async () => { throw cleanup; }, remove,
    ])).rejects.toMatchObject({ errors: [primary, cleanup] });
    expect(remove).toHaveBeenCalledOnce();
  });

  it('preserves a non-Error rejection as the failure cause', async () => {
    const operation = vi.fn(async () => undefined).mockRejectedValue('foreign failure');
    await expect(runAttachmentMemoryWitnessWithCleanup(operation, []))
      .rejects.toMatchObject({ cause: 'foreign failure' });
  });

  it('completes normally after successful work and cleanup', async () => {
    const close = vi.fn(async () => undefined);
    await runAttachmentMemoryWitnessWithCleanup(async () => undefined, [close]);
    expect(close).toHaveBeenCalledOnce();
  });
});
