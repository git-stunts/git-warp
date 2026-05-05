import { IndexShard } from './IndexShard.ts';

/** Build metadata receipt. */
export class ReceiptShard extends IndexShard {
  readonly version: number;
  readonly nodeCount: number;
  readonly labelCount: number;
  readonly shardCount: number;

  constructor({ shardKey = 'receipt', schemaVersion = 1, version, nodeCount, labelCount, shardCount }: {
    shardKey?: string;
    schemaVersion?: number;
    version: number;
    nodeCount: number;
    labelCount: number;
    shardCount: number;
  }) {
    super({ shardKey, schemaVersion });
    this.version = version;
    this.nodeCount = nodeCount;
    this.labelCount = labelCount;
    this.shardCount = shardCount;
    Object.freeze(this);
  }
}
