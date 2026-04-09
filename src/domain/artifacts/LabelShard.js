import { IndexShard } from './IndexShard.js';

/** Label registry (append-only label-to-ID mapping). */
export class LabelShard extends IndexShard {
  /** Creates an instance.
   * @param {{ shardKey?: string, schemaVersion?: number, labels: Array<[string, number]> }} fields
   */
  constructor({ shardKey = 'global', schemaVersion = 1, labels }) {
    super({ shardKey, schemaVersion });
    /** @type {Array<[string, number]>} */
    this.labels = labels;
    Object.freeze(this);
  }
}
