import ConeRecordError from '../../errors/ConeRecordError.ts';
import ConeDotClaim from './ConeDotClaim.ts';
import ConeRecordKey, { type ConeDotSet } from './ConeRecordKey.ts';
import { requireCount, requireIdentity } from './ConeRecordValidation.ts';

/** Consecutive dot counters of one writer that share a page. */
export const CONE_DOT_PAGE_SPAN = 256;

const DOT_SETS: ReadonlySet<string> = new Set(['node', 'edge']);

/** Constructor fields of a dot page. */
export type ConeDotPageFields = {
  readonly set: ConeDotSet;
  readonly writerId: string;
  readonly pageIndex: number;
  /** Dot counter to its claim; every counter lies inside this page's span. */
  readonly claims: ReadonlyMap<number, ConeDotClaim>;
};

/**
 * The dot claims of one writer's counters `[pageIndex * span, (pageIndex + 1) * span)`
 * in one OR-Set. A writer mints counters in sequence, so a patch's dots share
 * one page and a fold reads and rewrites one small record per writer.
 */
export default class ConeDotPage {
  readonly set: ConeDotSet;
  readonly writerId: string;
  readonly pageIndex: number;
  readonly claims: ReadonlyMap<number, ConeDotClaim>;

  constructor(fields: ConeDotPageFields) {
    if (!DOT_SETS.has(fields.set)) {
      throw new ConeRecordError(`Unknown cone dot set ${String(fields.set)}`);
    }
    this.set = fields.set;
    this.writerId = requireIdentity(fields.writerId, 'writerId');
    this.pageIndex = requireCount(fields.pageIndex, 'pageIndex');
    this.claims = requireClaims(fields.claims, this.pageIndex);
    Object.freeze(this);
  }

  static empty(set: ConeDotSet, writerId: string, pageIndex: number): ConeDotPage {
    return new ConeDotPage({ set, writerId, pageIndex, claims: new Map() });
  }

  /** The page index holding a dot counter. */
  static pageOf(counter: number): number {
    return Math.floor(counter / CONE_DOT_PAGE_SPAN);
  }

  key(): ConeRecordKey {
    return ConeRecordKey.forDotPage(this.set, this.writerId, this.pageIndex);
  }

  claim(counter: number): ConeDotClaim {
    return this.claims.get(counter) ?? ConeDotClaim.none();
  }

  withClaim(counter: number, claim: ConeDotClaim): ConeDotPage {
    return new ConeDotPage({ ...this, claims: new Map([...this.claims, [counter, claim]]) });
  }

  equals(other: ConeDotPage): boolean {
    if (other.set !== this.set || other.writerId !== this.writerId || other.pageIndex !== this.pageIndex) {
      return false;
    }
    return other.claims.size === this.claims.size
      && [...this.claims].every(([counter, claim]) => other.claim(counter).equals(claim));
  }
}

function requireClaims(claims: ReadonlyMap<number, ConeDotClaim>, pageIndex: number): ReadonlyMap<number, ConeDotClaim> {
  if (!(claims instanceof Map)) {
    throw new ConeRecordError('Cone dot page claims must be a Map');
  }
  for (const [counter, claim] of claims) {
    if (!isClaimOnPage(counter, claim, pageIndex)) {
      throw new ConeRecordError('Cone dot page claim lies outside its page', { context: { counter, pageIndex } });
    }
  }
  return Object.freeze(new Map(claims));
}

function isClaimOnPage(counter: number, claim: ConeDotClaim, pageIndex: number): boolean {
  return Number.isSafeInteger(counter) && ConeDotPage.pageOf(counter) === pageIndex && claim instanceof ConeDotClaim;
}
