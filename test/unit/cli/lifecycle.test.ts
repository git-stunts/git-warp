import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  closeCommandResources,
  emitWithCommandShutdown,
} from '../../../bin/cli/lifecycle.ts';

const LIFECYCLE_SOURCE = readFileSync(
  new URL('../../../bin/cli/lifecycle.ts', import.meta.url),
  'utf8',
);

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

  it('preserves arbitrary output and cleanup rejection values', async () => {
    const outputFailure = 'stream failed';
    const cleanupFailure = Symbol('cleanup failed');

    await expect(emitWithCommandShutdown({
      closeCommand: vi.fn(),
      emit: vi.fn().mockRejectedValue(outputFailure),
      installShutdown: vi.fn(() => vi.fn().mockRejectedValue(cleanupFailure)),
    })).rejects.toMatchObject({
      errors: [outputFailure, cleanupFailure],
    });
  });

  it('does not retain CLI failures in explicit unknown bags', () => {
    expect(LIFECYCLE_SOURCE).not.toContain('operationFailure: unknown');
    expect(LIFECYCLE_SOURCE).not.toContain('failures: unknown[]');
  });

  it('installs shutdown before consuming output and cleans up a rejected stream', async () => {
    const streamFailure = new Error('stream failed');
    const events: string[] = [];
    const closeCommand = vi.fn(async () => {
      events.push('close');
    });
    const installShutdown = vi.fn(() => {
      events.push('install');
      return closeCommand;
    });
    const emit = vi.fn(async () => {
      events.push('emit');
      throw streamFailure;
    });

    await expect(emitWithCommandShutdown({
      closeCommand,
      emit,
      installShutdown,
    })).rejects.toBe(streamFailure);

    expect(events).toEqual(['install', 'emit', 'close']);
    expect(closeCommand).toHaveBeenCalledTimes(1);
  });
});
