import { freezeRepairHints, type RepairHint } from './ReceiptSupport.ts';

/** Known not to have published. Submitting the intent again is a new attempt, and the caller's decision. */
export default class UnpublishedWriteReceipt {
  readonly operation: 'write' = 'write';
  readonly graph: string;
  readonly writer: string;
  /** The policy-safe reason, such as `stale-predecessor`. A denial reads `access-denied: <its cause>`. */
  readonly cause: string;
  readonly repairHints: readonly RepairHint[];

  constructor(fields: {
    readonly graph: string;
    readonly writer: string;
    readonly cause: string;
    readonly repairHints?: readonly RepairHint[];
  }) {
    this.graph = fields.graph;
    this.writer = fields.writer;
    this.cause = fields.cause;
    this.repairHints = freezeRepairHints(fields.repairHints ?? []);
    Object.freeze(this);
  }
}
