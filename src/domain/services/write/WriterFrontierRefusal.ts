import { freezeRepairHints, type RepairHint } from '../../api/ReceiptSupport.ts';

/**
 * Why a graph's writer frontier refuses a write, as the cause and repair its receipt
 * carries (#1075). `FULL` answers a new writer on a frontier that holds exactly the
 * limit: every writer already in it still writes. `OVER_LIMIT` answers any writer on
 * a frontier that holds more, where custody retains no write at all. A frontier gets
 * there when new writers make their first writes at once, or when writer chains
 * arrive from another clone: a basis folds every writer ref its repository holds.
 */
export default class WriterFrontierRefusal {
  static readonly FULL = new WriterFrontierRefusal('writer-limit-reached', {
    code: 'reuse_writer_id',
    message: 'This graph already has as many writers as one write can retain; write as one of its existing writer IDs, such as one of a bounded pool that users share.',
  });

  static readonly OVER_LIMIT = new WriterFrontierRefusal('retention-refused-writer-limit', {
    code: 'compact_writer_frontier',
    message: 'This graph\'s frontier holds more writers than one write can retain, so the graph accepts no write from any writer ID. Only compacting the frontier would repair it, and git-warp cannot do that yet: issue #1044 tracks it.',
  });

  readonly cause: string;
  readonly repairHints: readonly RepairHint[];

  private constructor(cause: string, repair: RepairHint) {
    this.cause = cause;
    this.repairHints = freezeRepairHints([repair]);
    Object.freeze(this);
  }
}
