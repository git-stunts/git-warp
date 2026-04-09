import { IndexShard } from './IndexShard.js';

/** Build metadata receipt. */
export class ReceiptShard extends IndexShard {
  /** Creates an instance.
   * @param {{ shardKey?: string, schemaVersion?: number, version: number, nodeCount: number, labelCount: number, shardCount: number }} fields
   */
  constructor({ shardKey = 'receipt', schemaVersion = 1, version, nodeCount, labelCount, shardCount }) {
    super({ shardKey, schemaVersion });
    /** @type {number} */
    this.version = version;
    /** @type {number} */
    this.nodeCount = nodeCount;
    /** @type {number} */
    this.labelCount = labelCount;
    /** @type {number} */
    this.shardCount = shardCount;
    Object.freeze(this);
  }
}
