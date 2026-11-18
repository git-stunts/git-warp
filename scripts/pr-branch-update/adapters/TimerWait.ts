import type { WaitPort } from '../WaitPort.ts';

/** The real WaitPort: a host timer. */
export default class TimerWait implements WaitPort {
  wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }
}
