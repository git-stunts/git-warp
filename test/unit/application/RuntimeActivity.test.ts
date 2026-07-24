import { describe, expect, it, vi } from 'vitest';

import RuntimeActivity from '../../../src/application/RuntimeActivity.ts';

describe('RuntimeActivity', () => {
  it('waits for admitted local work, closes once, and rejects new work', async () => {
    const activity = new RuntimeActivity();
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const active = activity.run(async () => await gate);
    const release = vi.fn(async () => {});

    const firstClose = activity.close(release);
    const secondClose = activity.close(release);
    expect(firstClose).toBe(secondClose);
    expect(release).not.toHaveBeenCalled();
    expect(() => activity.run(async () => {})).toThrowError(
      expect.objectContaining({ code: 'E_RUNTIME_CLOSED' }),
    );

    finish();
    await active;
    await firstClose;
    expect(release).toHaveBeenCalledOnce();
  });

  it('keeps close pending until an admitted lease is released', async () => {
    const activity = new RuntimeActivity();
    const lease = activity.acquire();
    const release = vi.fn(async () => {});

    const closing = activity.close(release);
    expect(release).not.toHaveBeenCalled();
    expect(() => activity.acquire()).toThrowError(
      expect.objectContaining({ code: 'E_RUNTIME_CLOSED' }),
    );

    lease.release();
    lease.release();
    await closing;
    expect(release).toHaveBeenCalledOnce();
  });

  it('forgets rejected work before releasing local resources', async () => {
    const activity = new RuntimeActivity();
    const failed = activity.run(async () => {
      throw new Error('activity failed');
    });
    const release = vi.fn(async () => {});

    await expect(failed).rejects.toThrow('activity failed');
    await activity.close(release);
    expect(release).toHaveBeenCalledOnce();
  });
});
