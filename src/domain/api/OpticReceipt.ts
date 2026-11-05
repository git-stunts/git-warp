import { freezeRepairHints, type RepairHint } from './ReceiptSupport.ts';

export type OpticReceiptStatus = 'completed' | 'cancelled' | 'refused' | 'failed' | 'budget-exhausted';

/**
 * How one read ended. Exactly one terminal result wins, and later cancellation
 * leaves it unchanged. Only `completed` claims the question was answered. Durable
 * retention and its Coordinate are not part of this yet (#1052).
 */
export default class OpticReceipt {
  readonly operation: 'observation' = 'observation';
  readonly status: OpticReceiptStatus;
  readonly graph: string;
  readonly observer: string;
  readonly purpose: string;
  readonly question: string;
  /** The policy-safe reason, for anything but `completed`. */
  readonly cause: string | null;
  readonly repairHints: readonly RepairHint[];
  /** Records read before it ended. */
  readonly records: number;

  constructor(fields: {
    readonly status: OpticReceiptStatus;
    readonly graph: string;
    readonly observer: string;
    readonly purpose: string;
    readonly question: string;
    readonly cause: string | null;
    readonly repairHints?: readonly RepairHint[];
    readonly records: number;
  }) {
    this.status = fields.status;
    this.graph = fields.graph;
    this.observer = fields.observer;
    this.purpose = fields.purpose;
    this.question = fields.question;
    this.cause = fields.cause;
    this.repairHints = freezeRepairHints(fields.repairHints ?? []);
    this.records = fields.records;
    Object.freeze(this);
  }
}
