import { IndexShard } from './IndexShard.ts';

/** Property index data for a shard. */
export class PropertyShard extends IndexShard {
  readonly entries: Array<[string, Record<string, unknown>]>; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B

  constructor({ shardKey, schemaVersion = 1, entries }: {
    shardKey: string;
    schemaVersion?: number;
    entries: Array<[string, Record<string, unknown>]>; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  }) {
    super({ shardKey, schemaVersion });
    this.entries = entries;
    Object.freeze(this);
  }
}
