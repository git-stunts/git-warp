import type ClockPort from '../../ports/ClockPort.ts';

/** ClockPort backed by the host wall clock (Node, Deno, Bun, browsers). */
export default class HostClockAdapter implements ClockPort {
  nowMs(): number {
    return Date.now();
  }
}
