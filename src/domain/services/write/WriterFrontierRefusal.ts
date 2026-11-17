import { freezeRepairHints, type RepairHint } from '../../api/ReceiptSupport.ts';

/**
 * Why a graph's writer frontier refuses a write, as the cause and repair its receipt
 * carries (#1075). `FULL` answers a new writer on a frontier that holds the limit or
 * more: every writer already in it still writes (#1197).
 */
export default class WriterFrontierRefusal {
  static readonly FULL = new WriterFrontierRefusal('writer-limit-reached', {
    code: 'reuse_writer_id',
    message: 'This graph already has as many writers as one write can retain; write as a writer ID that this clone already writes as, such as one of a bounded pool that its users share.',
  });

  readonly cause: string;
  readonly repairHints: readonly RepairHint[];

  private constructor(cause: string, repair: RepairHint) {
    this.cause = cause;
    this.repairHints = freezeRepairHints([repair]);
    Object.freeze(this);
  }
}
