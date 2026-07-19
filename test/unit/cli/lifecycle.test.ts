import { describe, expect, it, vi } from 'vitest';
import { closeCommandResources } from '../../../bin/cli/lifecycle.ts';

describe('CLI long-running command lifecycle', () => {
  it('drains the command before closing its storage', async () => {
    const commandClosed = Promise.withResolvers<void>();
    const events: string[] = [];
    const closeCommand = vi.fn(async () => {
      events.push('command:start');
      await commandClosed.promise;
      events.push('command:end');
    });
    const closeStorage = vi.fn(async () => {
      events.push('storage');
    });

    const closing = closeCommandResources(closeCommand, closeStorage);
    await vi.waitFor(() => expect(closeCommand).toHaveBeenCalledTimes(1));
    expect(closeStorage).not.toHaveBeenCalled();
    commandClosed.resolve();
    await closing;

    expect(events).toEqual(['command:start', 'command:end', 'storage']);
  });

  it('attempts storage closure and preserves both shutdown failures', async () => {
    const commandFailure = new Error('command close failed');
    const storageFailure = new Error('storage close failed');
    const closeStorage = vi.fn().mockRejectedValue(storageFailure);

    const closing = closeCommandResources(
      vi.fn().mockRejectedValue(commandFailure),
      closeStorage,
    );

    await expect(closing).rejects.toMatchObject({
      errors: [commandFailure, storageFailure],
    });
    expect(closeStorage).toHaveBeenCalledTimes(1);
  });
});
