import { vi } from 'vitest';
import type SchedulerPort from '../../src/ports/SchedulerPort.ts';

/**
 * Creates a timer-backed scheduler for polling tests. It refuses to schedule
 * on real timers: the caller must install `vi.useFakeTimers()` first.
 */
export function createTimerScheduler(): SchedulerPort {
  return {
    scheduleEvery(callback: () => void, ms: number) {
      if (!vi.isFakeTimers()) {
        throw new Error('createTimerScheduler needs vi.useFakeTimers() before it schedules');
      }
      // eslint-disable-next-line no-restricted-syntax -- fake timers: the check above proves vi.useFakeTimers() is installed
      const id = globalThis.setInterval(callback, ms);
      return {
        cancel: () => {
          globalThis.clearInterval(id);
        },
      };
    },
  };
}
