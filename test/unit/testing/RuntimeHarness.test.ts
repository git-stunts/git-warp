import { stat } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  createRuntimeHarness,
  createRuntimeHarnessWithHost,
  type RuntimeHarnessHost,
} from '../../../testing.ts';
import { createDefaultRuntimeHarnessHost } from '../../../src/infrastructure/adapters/RuntimeHarnessHostAdapter.ts';

describe('Runtime testing harness', () => {
  it('rejects missing options before creating a repository', async () => {
    await expect(createRuntimeHarness(null as never)).rejects.toMatchObject({
      code: 'E_RUNTIME_HARNESS_OPTIONS',
    });
  });

  it('rejects a missing host before creating a repository', async () => {
    await expect(
      createRuntimeHarnessWithHost({ writer: 'agent-1' }, null as never)
    ).rejects.toMatchObject({
      code: 'E_RUNTIME_HARNESS_HOST',
    });
    await expect(
      createRuntimeHarnessWithHost({ writer: 'agent-1' }, Object.freeze({}) as never)
    ).rejects.toMatchObject({
      code: 'E_RUNTIME_HARNESS_HOST',
    });
  });

  it('removes the repository when Runtime creation fails', async () => {
    let removed = false;
    const host: RuntimeHarnessHost = Object.freeze({
      createRepository: async () => '/tmp/git-warp-runtime-failed-open',
      openRuntime: async () => {
        throw new Error('open failed');
      },
      removeRepository: async () => {
        removed = true;
      },
    });

    await expect(createRuntimeHarnessWithHost({ writer: 'agent-1' }, host)).rejects.toThrow(
      'open failed'
    );
    expect(removed).toBe(true);
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

  it('retries cleanup after a transient host failure', async () => {
    const defaultHost = createDefaultRuntimeHarnessHost();
    let removalAttempts = 0;
    const host: RuntimeHarnessHost = Object.freeze({
      ...defaultHost,
      removeRepository: async (at): Promise<void> => {
        removalAttempts += 1;
        if (removalAttempts === 1) {
          throw new Error('transient cleanup failure');
        }
        await defaultHost.removeRepository(at);
      },
    });
    const harness = await createRuntimeHarnessWithHost({ writer: 'agent-1' }, host);
    const at = harness.at;

    await expect(harness.close()).rejects.toThrow('transient cleanup failure');
    expect(removalAttempts).toBe(1);
    await expect(stat(at)).resolves.toMatchObject({});

    await expect(harness.close()).resolves.toBeUndefined();
    expect(removalAttempts).toBe(2);
    await expect(stat(at)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
