import { stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { createRuntimeHarness } from '../../../testing.ts';

describe('Runtime testing harness', () => {
  it('rejects missing options before creating a repository', async () => {
    await expect(createRuntimeHarness(null as never)).rejects.toMatchObject({
      code: 'E_RUNTIME_HARNESS_OPTIONS',
    });
  });

  it('opens the production Runtime boundary in a disposable repository', async () => {
    const harness = await createRuntimeHarness({ writer: 'agent-1' });
    const at = harness.at;
    try {
      expect((await stat(at)).isDirectory()).toBe(true);
      expect(harness.runtime.writer).toBe('agent-1');
      await expect(harness.runtime.lane('events')).resolves.toMatchObject({
        kind: 'worldline',
        name: 'events',
        writer: 'agent-1',
      });
    } finally {
      await harness.close();
    }

    await expect(stat(at)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(harness.close()).resolves.toBeUndefined();
  });
});
