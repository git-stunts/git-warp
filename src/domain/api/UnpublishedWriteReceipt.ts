import { freezeRepairHints, type RepairHint } from './ReceiptSupport.ts';

/** Known not to have published. Submitting the intent again is a new attempt, and the caller's decision. */
export default class UnpublishedWriteReceipt {
  readonly operation: 'write' = 'write';
  readonly graph: string;
  readonly writer: string;
  /**
   * The policy-safe reason, such as `stale-predecessor`. A denial reads `access-denied: <its cause>`.
   * An unavailable store at the basis-open, premise-read, attempt-journal or custody-support step
   * reads `write-basis-unavailable`, `write-premise-unavailable`, `attempt-journal-unavailable` or
   * `retention-unavailable`; a custody ledger that does not answer also reads `retention-unavailable`
   * (contract section 11 of `docs/plans/optic-only-public-api.md`). A new writer on a graph that
   * already has 4,096 writers reads `writer-limit-reached` (#1075); writers already in it keep
   * writing (#1197). Any writer on a clone whose frontier names more writers than `frontierBytes`
   * can record reads `retention-refused-frontier-limit`.
   */
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
