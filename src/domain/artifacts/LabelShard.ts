import { IndexShard } from './IndexShard.ts';

/** Label registry (append-only label-to-ID mapping). */
export class LabelShard extends IndexShard {
  readonly labels: Array<[string, number]>;

  constructor({ shardKey = 'global', schemaVersion = 1, labels }: {
    shardKey?: string;
    schemaVersion?: number;
    labels: Array<[string, number]>;
  }) {
    super({ shardKey, schemaVersion });
    this.labels = labels;
    Object.freeze(this);
  }
}
