import type TreeEntryFound from './TreeEntryFound.ts';
import type TreeEntryLimit from './TreeEntryLimit.ts';
import type TreeEntryPath from './TreeEntryPath.ts';
import WarpError from '../errors/WarpError.ts';

export default class TreeEntryPrefixBatch {
  readonly prefix: TreeEntryPath;
  readonly limit: TreeEntryLimit;
  readonly entries: readonly TreeEntryFound[];

  constructor(options: {
    readonly prefix: TreeEntryPath;
    readonly limit: TreeEntryLimit;
    readonly entries: readonly TreeEntryFound[];
  }) {
    if (options.entries.length > options.limit.value) {
      throw new WarpError(
        `Tree entry prefix batch size ${options.entries.length} exceeds limit ${options.limit.value}`,
        'E_TREE_ENTRY_PREFIX_BATCH_LIMIT',
      );
    }
    this.prefix = options.prefix;
    this.limit = options.limit;
    this.entries = Object.freeze([...options.entries]);
    Object.freeze(this);
  }

  hasEntries(): boolean {
    return this.entries.length > 0;
  }
}
