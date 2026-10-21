import CrdtError from '../errors/CrdtError.ts';
import { validateWriterId } from '../utils/RefLayout.ts';
import { requireStrandId } from './StrandId.ts';

const SIGIL = '@';
const WRITER_KIND = 'w.';
const STRAND_KIND = 's.';
const BRAID_KIND = 'b.';

/**
 * The issuing authority behind a dot: one writer on one worldline (#1014).
 *
 * A root-worldline (lane) writer keeps its bare key, so lane history is
 * untouched. A writer on a strand is spelled `@w.<writer>@s.<strand-id>`.
 * Each identity has exactly one spelling; `decode` refuses every other one.
 */
export default class MintId {
  readonly writerId: string;
  /** The strand's immutable id, or null for the root worldline. */
  readonly strandId: string | null;

  private constructor(writerId: string, strandId: string | null) {
    validateWriterId(writerId);
    if (strandId !== null) { requireStrandId(strandId); }
    this.writerId = writerId;
    this.strandId = strandId;
    Object.freeze(this);
  }

  /** `writerId` on the lane (root worldline). */
  static root(writerId: string): MintId {
    return new MintId(writerId, null);
  }

  /** `writerId` on strand `strandId`. */
  static strand(writerId: string, strandId: string): MintId {
    return new MintId(writerId, strandId);
  }

  /** Parses the single canonical spelling of a mint id. */
  static decode(spelling: string): MintId {
    if (typeof spelling !== 'string' || spelling.length === 0) {
      throw invalidSpelling(String(spelling), 'is empty');
    }
    if (!spelling.includes(SIGIL)) { return MintId.root(spelling); }
    const [writerPart, strandPart] = sigilParts(spelling);
    requireKind(spelling, writerPart, WRITER_KIND);
    requireKind(spelling, strandPart, STRAND_KIND);
    return MintId.strand(writerPart.slice(WRITER_KIND.length), strandPart.slice(STRAND_KIND.length));
  }

  /** True when `spelling` is a canonical mint id spelling. */
  static isSpelling(spelling: string): boolean {
    try {
      MintId.decode(spelling);
      return true;
    } catch {
      return false;
    }
  }

  get isRoot(): boolean {
    return this.strandId === null;
  }

  /** The one persisted spelling: a version-vector key and a dot's writer. */
  encode(): string {
    return this.strandId === null
      ? this.writerId
      : `${SIGIL}${WRITER_KIND}${this.writerId}${SIGIL}${STRAND_KIND}${this.strandId}`;
  }

  equals(other: MintId): boolean {
    return this.writerId === other.writerId && this.strandId === other.strandId;
  }
}

/** Splits `@w.<writer>@s.<strand>` into its two sigil parts, refusing any other shape. */
function sigilParts(spelling: string): [string, string] {
  const [lead, writerPart, strandPart, ...rest] = spelling.split(SIGIL);
  if (lead !== '' || rest.length > 0 || writerPart === undefined || strandPart === undefined) {
    throw invalidSpelling(spelling, 'is not @w.<writer>@s.<strand-id>');
  }
  return [writerPart, strandPart];
}

function requireKind(spelling: string, part: string, kind: string): void {
  if (part.startsWith(kind)) { return; }
  const reason = part.startsWith(BRAID_KIND) ? 'uses the reserved braid sigil @b.' : `needs @${kind}`;
  throw invalidSpelling(spelling, reason);
}

function invalidSpelling(spelling: string, reason: string): CrdtError {
  return new CrdtError(`Invalid mint id '${spelling}': ${reason}`, {
    code: 'E_CRDT_INVALID_MINT_ID',
    context: { spelling },
  });
}
