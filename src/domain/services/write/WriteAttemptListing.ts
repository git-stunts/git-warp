import type WriteAttemptRecord from './WriteAttemptRecord.ts';

/**
 * One bounded page of saved write attempts. `unsupportedRefs` names the refs it passed over
 * because they hold well-formed records in a layout this build does not read (#1072); they
 * do not count against the page's limit. The sweep does not surface them yet (#1107).
 */
export default class WriteAttemptListing {
  readonly records: readonly WriteAttemptRecord[];
  readonly unsupportedRefs: readonly string[];

  constructor(fields: { readonly records: readonly WriteAttemptRecord[]; readonly unsupportedRefs: readonly string[] }) {
    this.records = Object.freeze([...fields.records]);
    this.unsupportedRefs = Object.freeze([...fields.unsupportedRefs]);
    Object.freeze(this);
  }

  static empty(): WriteAttemptListing {
    return new WriteAttemptListing({ records: [], unsupportedRefs: [] });
  }

  get unsupported(): number {
    return this.unsupportedRefs.length;
  }
}
