import { freezeRepairHints, type RepairHint } from '../../api/ReceiptSupport.ts';

/**
 * Why a graph's writer frontier refuses a write, as the cause and repair its receipt
 * carries (#1075). {@link WriterFrontierRefusal.full} answers a new writer on a frontier
 * that holds the admission limit or more: every writer already in it still writes (#1197).
 */
export default class WriterFrontierRefusal {
  /** The refusal of a new writer once the graph admits `limit` writer IDs. */
  static full(limit: number): WriterFrontierRefusal {
    return new WriterFrontierRefusal('writer-limit-reached', {
      code: 'reuse_writer_id',
      message: `This graph already admits at most ${grouped(limit)} writer IDs; write as a writer ID that this clone already writes as, such as one of a bounded pool that its users share.`,
    });
  }

  readonly cause: string;
  readonly repairHints: readonly RepairHint[];

  private constructor(cause: string, repair: RepairHint) {
    this.cause = cause;
    this.repairHints = freezeRepairHints([repair]);
    Object.freeze(this);
  }
}

/** A count with thousands separators, as the documentation writes it: 4096 is `4,096`. */
function grouped(count: number): string {
  return String(count).replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
}
