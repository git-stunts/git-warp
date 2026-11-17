import type GitProcessCount from './GitProcessCount.ts';
import type GitProcessCounter from './GitProcessCounter.ts';
import WitnessOutcome from './WitnessOutcome.ts';
import type WitnessReport from './WitnessReport.ts';
import WitnessSample, { type WitnessPhase } from './WitnessSample.ts';

/** Retains an operation's observed outcome and trace delta before cleanup. */
export default class SampleRecorder {
  readonly #counter: GitProcessCounter;
  readonly #report: WitnessReport;
  #sequence = 0;

  constructor(counter: GitProcessCounter, report: WitnessReport) {
    this.#counter = counter;
    this.#report = report;
  }

  async measure(identity: {
    readonly phase: WitnessPhase; readonly operation: string;
    readonly documentId: string; readonly subjectId: string;
  }, run: () => WitnessOutcome | Promise<WitnessOutcome>): Promise<WitnessOutcome> {
    let outcome: WitnessOutcome;
    try {
      outcome = await run();
    } catch (error) {
      outcome = new WitnessOutcome('error', error instanceof Error ? error.message.slice(0, 2048) : 'operation threw a non-Error value');
    }
    let count: GitProcessCount | null = null;
    try {
      count = this.#counter.capture();
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'trace capture failed';
      outcome = new WitnessOutcome('error', ('trace incomplete: ' + detail).slice(0, 2048), outcome.membership);
    }
    await this.#report.retain(new WitnessSample({ sequence: this.#sequence++, ...identity, count, outcome }));
    if (count === null) {
      throw new TypeError('trace observation is incomplete; stop before another operation');
    }
    return outcome;
  }
}
