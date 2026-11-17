import type GitProcessCount from './GitProcessCount.ts';
import type WitnessOutcome from './WitnessOutcome.ts';

export type WitnessPhase = 'setup' | 'bulk' | 'save' | 'margins' | 'cold' | 'close';
const PHASES: ReadonlySet<string> = new Set(['setup', 'bulk', 'save', 'margins', 'cold', 'close']);

/** One operation interval, including its exact requested identities and outcome. */
export default class WitnessSample {
  readonly sequence: number;
  readonly phase: WitnessPhase;
  readonly operation: string;
  readonly documentId: string;
  readonly subjectId: string;
  readonly count: GitProcessCount | null;
  readonly outcome: WitnessOutcome;

  constructor(fields: {
    readonly sequence: number; readonly phase: WitnessPhase; readonly operation: string;
    readonly documentId: string; readonly subjectId: string;
    readonly count: GitProcessCount | null; readonly outcome: WitnessOutcome;
  }) {
    if (!Number.isSafeInteger(fields.sequence) || fields.sequence < 0 || !PHASES.has(fields.phase)
      || fields.operation.length === 0 || fields.operation.length > 128
      || fields.documentId.length > 4096 || fields.subjectId.length > 4096) {
      throw new TypeError('a witness sample needs bounded, explicit operation identity');
    }
    this.sequence = fields.sequence;
    this.phase = fields.phase;
    this.operation = fields.operation;
    this.documentId = fields.documentId;
    this.subjectId = fields.subjectId;
    this.count = fields.count;
    this.outcome = fields.outcome;
    Object.freeze(this);
  }
}
