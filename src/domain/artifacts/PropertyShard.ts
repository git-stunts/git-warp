import { IndexShard } from './IndexShard.ts';

/** Property index data for a shard. */
export class PropertyShard extends IndexShard {
  readonly entries: Array<[string, Record<string, unknown>]>;

  constructor({ shardKey, schemaVersion = 1, entries }: {
    shardKey: string;
    schemaVersion?: number;
    entries: Array<[string, Record<string, unknown>]>;
  }) {
    super({ shardKey, schemaVersion });
    this.entries = entries;
    Object.freeze(this);
  }
}
