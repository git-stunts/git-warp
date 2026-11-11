import { setImmediate as nextTurn } from 'node:timers/promises';

/**
 * Waits, one event-loop turn at a time, until `condition` returns true. It
 * has no deadline of its own: the test timeout bounds it, so a slow machine
 * cannot turn a correct run into a failure.
 */
export async function waitForCondition(condition: () => boolean | Promise<boolean>): Promise<void> {
  while (!(await condition())) {
    await nextTurn();
  }
}
