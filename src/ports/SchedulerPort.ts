/**
 * SchedulerPort — explicit recurring task scheduling capability.
 *
 * Timer ownership lives at the adapter/application boundary. Domain services
 * can request recurring work only through this port and cancel only through the
 * returned task handle.
 *
 * @module ports/SchedulerPort
 */

/** Cancel handle returned by recurring scheduler registrations. */
export abstract class ScheduledTask {
  /** Stops future callback delivery for the scheduled task. */
  abstract cancel(): void;
}

/** Port for recurring task scheduling. */
export default abstract class SchedulerPort {
  /** Runs `callback` repeatedly at the supplied interval in milliseconds. */
  abstract scheduleEvery(_callback: () => void, _ms: number): ScheduledTask;
}
