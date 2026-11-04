import ConeDotPage from './ConeDotPage.ts';
import type ConeFootprint from './ConeFootprint.ts';
import type ConeRecordSnapshot from './ConeRecordSnapshot.ts';
import ConeSharedDotObstruction from './ConeSharedDotObstruction.ts';
import type ConeDotMention from './ConeDotMention.ts';

/**
 * Settles one patch's dot claims against the stored claims.
 *
 * A dot that only ever tags one element keeps per-element tombstones exact.
 * The ledger records every element each dot is claimed by and refuses a
 * patch the moment a dot would be both removed and claimed by more than one
 * element, whichever order the add and the remove arrive in.
 */
export default class ConeDotLedger {
  /**
   * The updated dot pages for the patch, or the obstruction that stops it.
   * Pages whose claims did not change are omitted.
   */
  static settle(
    snapshot: ConeRecordSnapshot,
    footprint: ConeFootprint,
    patchSha: string,
  ): readonly ConeDotPage[] | ConeSharedDotObstruction {
    const pages = new Map<string, ConeDotPage>();
    for (const mention of footprint.mentions) {
      const page = pageFor(pages, snapshot, mention);
      const claim = page.claim(mention.dot.counter);
      const next = mention.role === 'owner' ? claim.withOwner(mention.element) : claim.withRemover(mention.element);
      if (next.crossesElements()) {
        return new ConeSharedDotObstruction({ set: mention.set, dot: mention.dot, elements: next.elements(), patchSha });
      }
      pages.set(page.key().toString(), page.withClaim(mention.dot.counter, next));
    }
    return Object.freeze([...pages.values()].filter((page) => !page.equals(stored(snapshot, page))));
  }
}

function pageFor(pages: ReadonlyMap<string, ConeDotPage>, snapshot: ConeRecordSnapshot, mention: ConeDotMention): ConeDotPage {
  const persisted = snapshot.dotPage(mention.set, mention.dot.writerId, ConeDotPage.pageOf(mention.dot.counter));
  return pages.get(persisted.key().toString()) ?? persisted;
}

function stored(snapshot: ConeRecordSnapshot, page: ConeDotPage): ConeDotPage {
  return snapshot.dotPage(page.set, page.writerId, page.pageIndex);
}
