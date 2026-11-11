import { describe, expect, it, vi } from 'vitest';
import HostClockAdapter from '../../../../src/infrastructure/adapters/HostClockAdapter.ts';
import RuntimeHost from '../../../../src/domain/RuntimeHost.ts';
import RuntimeDetachedFactory from '../../../../src/domain/warp/RuntimeDetachedFactory.ts';
import ManualClock from '../../../helpers/ManualClock.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';
import { openMemoryRuntimeHostProduct } from '../../../helpers/MemoryRuntimeHost.ts';

describe('RuntimeHost clock composition', () => {
  it('retains the caller clock when opening a runtime', async () => {
    const clock = new ManualClock();
    const runtime = await openMemoryRuntimeHostProduct({ persistence: new InMemoryGraphAdapter(),
      graphName: 'runtime-clock', writerId: 'client', clock });
    expect(runtime instanceof RuntimeHost && runtime._clock).toBe(clock);
  });

  it('uses the installed host clock by default', async () => {
    const runtime = await openMemoryRuntimeHostProduct({ persistence: new InMemoryGraphAdapter(),
      graphName: 'runtime-host-clock', writerId: 'client' });
    expect(runtime instanceof RuntimeHost && runtime._clock).toBeInstanceOf(HostClockAdapter);
  });

  it('retains the caller clock when forking a runtime', async () => {
    const clock = new ManualClock();
    const runtime = await openMemoryRuntimeHostProduct({ persistence: new InMemoryGraphAdapter(),
      graphName: 'clock-parent', writerId: 'client', clock });
    const patch = await runtime.createPatch();
    patch.addNode('seed');
    const at = await patch.commit();
    const fork = await runtime.fork({ from: 'client', at, forkName: 'clock-fork', forkWriterId: 'fork-writer' });
    expect(fork instanceof RuntimeHost && fork._clock).toBe(clock);
  });

  it('retains the caller clock when opening a detached read runtime', async () => {
    const clock = new ManualClock();
    const runtime = await openMemoryRuntimeHostProduct({ persistence: new InMemoryGraphAdapter(),
      graphName: 'clock-detached', writerId: 'client', clock });
    if (!(runtime instanceof RuntimeHost)) { throw new Error('expected the runtime host'); }
    const detached = await new RuntimeDetachedFactory(runtime, async options => await RuntimeHost.open(options))
      .openReadOnly();
    expect(detached instanceof RuntimeHost && detached._clock).toBe(clock);
  });

  it('requires explicit composition when no clock resolver is installed', async () => {
    vi.resetModules();
    const resolvers = await import('../../../../src/domain/warp/RuntimeHostPortResolvers.ts');
    await expect(resolvers.resolveConfiguredClock(undefined)).rejects.toMatchObject({ code: 'E_CLOCK_REQUIRED' });
    const clock = new ManualClock();
    expect(await resolvers.resolveConfiguredClock(clock)).toBe(clock);
    resolvers.installRuntimeHostClockResolver(() => clock);
    expect(await resolvers.resolveConfiguredClock(undefined)).toBe(clock);
  });

  it('reads epoch milliseconds from the host clock adapter', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(1_800_000_000_000);
      expect(new HostClockAdapter().nowMs()).toBe(1_800_000_000_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('installs a working wall clock for browser composition', async () => {
    vi.resetModules();
    const { installDefaultRuntimeHostBrowserPorts } = await import('../../../../src/application/RuntimeHostBrowserDefaults.ts');
    const { resolveConfiguredClock } = await import('../../../../src/domain/warp/RuntimeHostPortResolvers.ts');
    installDefaultRuntimeHostBrowserPorts();
    const clock = await resolveConfiguredClock(undefined);
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(1_800_000_000_000);
      expect(clock.nowMs()).toBe(1_800_000_000_000);
    } finally {
      vi.useRealTimers();
    }
  });
});
