import WarpError from '../errors/WarpError.ts';

const STATUSES: ReadonlySet<string> = new Set(['resolved', 'unmapped', 'ambiguous']);

/** How a retained admission's `allocationDot` resolves after the v21 migration (#1015). */
export type AllocationProvenanceStatus = 'resolved' | 'unmapped' | 'ambiguous';

/**
 * The identity a legacy `allocationDot` denoted. The original bytes stay in
 * the patch (an allocated entity's subject is derived from them) and are
 * returned unchanged; `identity` is the v21 mint id and counter, set only
 * when `status` is `resolved`. A legacy dot such as `next:2` can name a lane
 * writer or a pre-worldline strand, so readers resolve it here rather than
 * through the ordinary mint id codec.
 */
export default class AllocationProvenance {
  readonly status: AllocationProvenanceStatus;
  readonly original: string;
  readonly identity: string | null;
  readonly candidates: readonly string[];

  constructor(options: Readonly<{
    status: AllocationProvenanceStatus;
    original: string;
    identity: string | null;
    candidates: readonly string[];
  }>) {
    if (!STATUSES.has(options.status) || typeof options.original !== 'string' || options.original.length === 0) {
      throw invalid('AllocationProvenance requires a status and the original dot');
    }
    if ((options.status === 'resolved') !== (options.identity !== null)) {
      throw invalid('Only a resolved AllocationProvenance carries an identity');
    }
    this.status = options.status;
    this.original = options.original;
    this.identity = options.identity;
    this.candidates = Object.freeze([...options.candidates]);
    Object.freeze(this);
  }

  /** No migration mapping exists for this occurrence, for example a commit written after migration. */
  static unmapped(original: string): AllocationProvenance {
    return new AllocationProvenance({ status: 'unmapped', original, identity: null, candidates: [] });
  }
}

function invalid(message: string): WarpError {
  return new WarpError(message, 'E_ALLOCATION_PROVENANCE_INVALID');
}
