import type { WaitPort } from '../../../../scripts/pr-branch-update/WaitPort.ts';

/** A wait that returns at once and records each requested duration. */
export default class RecordingWait implements WaitPort {
  readonly waits: number[] = [];

  wait(milliseconds: number): Promise<void> {
    this.waits.push(milliseconds);
    return Promise.resolve();
  }
}
