import RetainedGraphError from '../errors/RetainedGraphError.ts';
import type ConeDotClaim from '../services/cone/ConeDotClaim.ts';
import ConeDotPage from '../services/cone/ConeDotPage.ts';
import ConeRecordKey from '../services/cone/ConeRecordKey.ts';
import GraphOrdinal from './GraphOrdinal.ts';
import OrdinalAddress from './OrdinalAddress.ts';
import type OrdinalGeometry from './OrdinalGeometry.ts';
import { requireStoredGeometry } from './OrdinalValidation.ts';

/**
 * One bounded ordinal-to-record address page (#815).
 *
 * The page is a cone dot page: the claims of one writer's
 * {@link OrdinalGeometry.pageSpan} consecutive counters in one OR-Set. The
 * owner a dot's add named is the element the ordinal addresses. A page holds
 * at most `pageSpan` ordinals however large the graph grows, so resolving
 * one ordinal reads exactly one record, this page, and no sibling.
 */
export default class OrdinalAddressPage {
  readonly geometry: OrdinalGeometry;
  readonly page: ConeDotPage;

  constructor(geometry: OrdinalGeometry, page: ConeDotPage) {
    if (!(page instanceof ConeDotPage)) {
      throw new RetainedGraphError('An ordinal address page must be a cone dot page', 'E_RETAINED_PAGE_INVALID');
    }
    this.geometry = requireStoredGeometry(geometry);
    this.page = page;
    Object.freeze(this);
  }

  /** The key of the one record that holds `ordinal`'s address. */
  static keyOf(ordinal: GraphOrdinal, geometry: OrdinalGeometry): ConeRecordKey {
    return ConeRecordKey.forDotPage(ordinal.kind, ordinal.writerId, geometry.pageIndexOf(ordinal.counter));
  }

  /** True when `ordinal` lies on this page. */
  covers(ordinal: GraphOrdinal): boolean {
    return ordinal.kind === this.page.set && this.#holds(ordinal);
  }

  /** The record `ordinal` addresses, or a typed refusal. */
  resolve(ordinal: GraphOrdinal): OrdinalAddress {
    if (ordinal.kind !== this.page.set) {
      throw new RetainedGraphError('Ordinal is of another kind than its address page', 'E_RETAINED_ADDRESS_KIND_MISMATCH', {
        context: { ordinal: ordinal.toString(), page: this.page.set },
      });
    }
    if (!this.#holds(ordinal)) {
      throw new RetainedGraphError('Ordinal lies outside this address page', 'E_RETAINED_ORDINAL_INVALID', {
        context: { ordinal: ordinal.toString(), writerId: this.page.writerId, pageIndex: this.page.pageIndex },
      });
    }
    return addressOf(ordinal, this.page.claim(ordinal.counter));
  }

  /** Every owned address on the page, in counter order; removed-only claims are skipped; fails closed on any duplicated ordinal. */
  addresses(): readonly OrdinalAddress[] {
    const counters = [...this.page.claims].filter(([, claim]) => claim.owners.size > 0).map(([counter]) => counter).sort((left, right) => left - right);
    return counters.map((counter) => this.resolve(new GraphOrdinal({ kind: this.page.set, writerId: this.page.writerId, counter })));
  }

  #holds(ordinal: GraphOrdinal): boolean {
    return ordinal.writerId === this.page.writerId && this.geometry.pageIndexOf(ordinal.counter) === this.page.pageIndex;
  }
}

function addressOf(ordinal: GraphOrdinal, claim: ConeDotClaim): OrdinalAddress {
  const owners = [...claim.owners];
  if (owners.length > 1) {
    throw new RetainedGraphError('Ordinal addresses more than one element', 'E_RETAINED_ADDRESS_DUPLICATE', {
      context: { ordinal: ordinal.toString(), owners: owners.length },
    });
  }
  const [owner] = owners;
  if (owner === undefined) {
    throw new RetainedGraphError('No element was added under this ordinal', 'E_RETAINED_ADDRESS_MISSING', {
      context: { ordinal: ordinal.toString() },
    });
  }
  return new OrdinalAddress(ordinal, ordinal.kind === 'node' ? ConeRecordKey.forNode(owner) : ConeRecordKey.forEdge(owner));
}
