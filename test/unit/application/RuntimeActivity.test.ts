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
});
