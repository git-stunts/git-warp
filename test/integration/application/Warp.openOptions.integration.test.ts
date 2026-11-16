import { setImmediate } from 'node:timers/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { intent } from '../../../advanced.ts';
import { GitStorage, LoggerPort, Warp, WarpAddress, type LogFields } from '../../../index.ts';
import {
  GRAPH,
  TestAccess,
  disposeWarpFixtures,
  git,
  materialized,
  open,
  repository,
  retained,
} from '../../helpers/WarpWriteFixture.ts';

afterEach(async () => {
  vi.restoreAllMocks();
  await disposeWarpFixtures();
});

/** Keeps every warning it is given. */
class RecordingLogger extends LoggerPort {
  readonly warnings: string[] = [];

  override debug(): void {}
  override info(): void {}
  override error(): void {}
  override warn(message: string): void {
    this.warnings.push(message);
  }
  override child(_context: LogFields): LoggerPort {
    return this;
  }
}

/** Throws from every method, as a broken log sink would. */
class ThrowingLogger extends LoggerPort {
  calls = 0;

  override debug(): void { this.#fail(); }
  override info(): void { this.#fail(); }
  override error(): void { this.#fail(); }
  override warn(): void { this.#fail(); }
  override child(): LoggerPort {
    this.#fail();
    return this;
  }

  #fail(): void {
    this.calls += 1;
    throw new Error('logger exploded');
  }
}

/** Rejects from `warn`, as an async log sink that lost its connection would. */
class RejectingLogger extends LoggerPort {
  calls = 0;

  override debug(): void {}
  override info(): void {}
  override error(): void {}
  override async warn(): Promise<void> {
    this.calls += 1;
    await Promise.resolve();
    throw new Error('async logger rejected');
  }
  override child(): LoggerPort {
    return this;
  }
}

async function removeAttached(warp: Warp): Promise<void> {
  retained(await warp.as('alice').execute(intent.entity.add({ subject: 'n', properties: { color: 'red' } })));
  retained(await warp.as('alice').execute(intent.node.remove({ subject: 'n' })));
}

/** Lets every queued promise job and I/O callback run, without reading any clock. */
async function settled(): Promise<void> {
  await setImmediate();
}

describe('the removal policy reaches the logger given to Warp.open (#1078)', () => {
  it('warns when a removed node still has attached data', async () => {
    const logger = new RecordingLogger();
    const warp = await open(await repository(), {}, new TestAccess(), { logger });

    await removeAttached(warp);

    expect(logger.warnings).toHaveLength(1);
    expect(logger.warnings[0]).toContain("Deleting node 'n' which has attached data");
  });

  it('prints nothing when no logger is given', async () => {
    const printed = [vi.spyOn(console, 'warn'), vi.spyOn(console, 'log'), vi.spyOn(console, 'info'), vi.spyOn(console, 'error')];

    await removeAttached(await open(await repository()));

    for (const print of printed) {
      expect(print).not.toHaveBeenCalled();
    }
  });

  it('keeps a write unchanged when the logger throws', async () => {
    const path = await repository();
    const logger = new ThrowingLogger();

    await removeAttached(await open(path, {}, new TestAccess(), { logger }));

    expect(logger.calls).toBeGreaterThan(0);
    expect((await materialized(path)).nodes).toEqual([]);
  });

  it('keeps a write unchanged, and raises no unhandled rejection, when an async logger rejects', async () => {
    const path = await repository();
    const logger = new RejectingLogger();
    const unhandled: unknown[] = [];
    const listener = (reason: unknown): void => { unhandled.push(reason); };
    process.on('unhandledRejection', listener);
    try {
      await removeAttached(await open(path, {}, new TestAccess(), { logger }));
      await settled();
    } finally {
      process.off('unhandledRejection', listener);
    }

    expect(logger.calls).toBe(1);
    expect(unhandled).toEqual([]);
    expect((await materialized(path)).nodes).toEqual([]);
  });
});

describe('Warp.open refuses options it cannot use (#1078)', () => {
  async function opening(path: string, options: object | null | number): Promise<Warp> {
    return await Reflect.apply(Warp.open, Warp, [WarpAddress.of(GitStorage.at(path), GRAPH), new TestAccess(), options]);
  }

  it('refuses options that are not a plain object, or that name an unknown option', async () => {
    const path = await repository();

    for (const options of [null, 5, [], new Date(0), new Map(), { loger: new RecordingLogger() }, { logger: undefined, clock: 1 }]) {
      await expect(opening(path, options)).rejects.toMatchObject({ code: 'E_WARP_OPEN_OPTIONS' });
    }
    expect(git(path, ['for-each-ref'])).toBe('');
  });

  it('refuses a logger that is not a LoggerPort with callable methods', async () => {
    const path = await repository();
    const uncallable = new RecordingLogger();
    Object.defineProperty(uncallable, 'child', { value: 'not a function' });

    for (const logger of [{ warn: (): void => {} }, null, Object.create(LoggerPort.prototype), uncallable]) {
      await expect(opening(path, { logger })).rejects.toMatchObject({ code: 'E_WARP_OPEN_LOGGER' });
    }
    expect(git(path, ['for-each-ref'])).toBe('');
  });

  it('accepts no options, empty options, a null-prototype object and an absent logger', async () => {
    const path = await repository();
    const bare = Object.assign(Object.create(null), { logger: new RecordingLogger() });

    for (const options of [{}, { logger: undefined }, bare]) {
      await (await opening(path, options)).close();
    }
    await (await Warp.open(WarpAddress.of(GitStorage.at(path), GRAPH), new TestAccess())).close();
  });
});
