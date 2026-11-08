import type WriteAttemptRecord from './WriteAttemptRecord.ts';

/**
 * One bounded page of saved write attempts. `retiredRefs` names the refs it skipped
 * because they hold layout-version-1 records (#1072), so they are never dropped silently.
 */
export default class WriteAttemptListing {
  readonly records: readonly WriteAttemptRecord[];
  readonly retiredRefs: readonly string[];

  constructor(fields: { readonly records: readonly WriteAttemptRecord[]; readonly retiredRefs: readonly string[] }) {
    this.records = Object.freeze([...fields.records]);
    this.retiredRefs = Object.freeze([...fields.retiredRefs]);
    Object.freeze(this);
  }

  static empty(): WriteAttemptListing {
    return new WriteAttemptListing({ records: [], retiredRefs: [] });
  }

  get retired(): number {
    return this.retiredRefs.length;
  }
}
