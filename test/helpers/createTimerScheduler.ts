import type SchedulerPort from '../../src/ports/SchedulerPort.ts';

/**
 * Creates a timer-backed scheduler for polling tests.
 */
export function createTimerScheduler(): SchedulerPort {
  return {
    scheduleEvery(callback: () => void, ms: number) {
      const id = globalThis.setInterval(callback, ms);
      return {
        cancel: () => {
          globalThis.clearInterval(id);
        },
      };
    },
  };
}
