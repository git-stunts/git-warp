import { describe, expect, it } from 'vitest';

import RuntimeMutationGate from '../../../src/application/RuntimeMutationGate.ts';

describe('RuntimeMutationGate', () => {
  it('serializes mutations in arrival order', async () => {
    const gate = new RuntimeMutationGate();
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstBlocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = gate.run(async () => {
      events.push('first:start');
      await firstBlocked;
      events.push('first:end');
      return 1;
    });
    await Promise.resolve();
    const second = gate.run(async () => {
      events.push('second');
      return 2;
    });

    expect(events).toEqual(['first:start']);
    releaseFirst?.();
    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(events).toEqual(['first:start', 'first:end', 'second']);
  });

  it('continues after a rejected mutation', async () => {
    const gate = new RuntimeMutationGate();
    const failed = gate.run(async () => {
      throw new Error('mutation failed');
    });
    const recovered = gate.run(async () => 'recovered');

    await expect(failed).rejects.toThrow('mutation failed');
    await expect(recovered).resolves.toBe('recovered');
  });
});
