import RouteKey from '../../orset/route/RouteKey.ts';
import ConeRecordError from '../../errors/ConeRecordError.ts';
import { FIELD_SEPARATOR } from '../KeyCodec.ts';

/** The record families of a cone record trie. */
export type ConeRecordFamily = 'node' | 'edge' | 'dot' | 'adjacency' | 'admission';

/** The OR-Set a dot belongs to: node membership or edge membership. */
export type ConeDotSet = 'node' | 'edge';

/** The adjacency direction of an edge key relative to a node. */
export type ConeDirection = 'out' | 'in';

const FAMILIES: ReadonlySet<string> = new Set(['node', 'edge', 'dot', 'adjacency', 'admission']);
const ROUTE_PATTERN = /^[0-9a-f]{64}$/u;

/**
 * Address of one record in a cone record trie.
 *
 * A key is the family plus the full BLAKE3 route key (hex) of the record's
 * identity string, the same routing the retained property-root profile uses
 * (`MaterializationPropertyProfile`). Identities never contain NUL, so the
 * composite identities of dot and adjacency pages join their parts with it.
 */
export default class ConeRecordKey {
  readonly family: ConeRecordFamily;
  readonly route: string;

  constructor(family: ConeRecordFamily, route: string) {
    if (!FAMILIES.has(family)) {
      throw new ConeRecordError(`Unknown cone record family ${String(family)}`);
    }
    if (!ROUTE_PATTERN.test(route)) {
      throw new ConeRecordError('Cone record route must be 64 lowercase hex characters', { context: { route } });
    }
    this.family = family;
    this.route = route;
    Object.freeze(this);
  }

  /** The key of a node's record. */
  static forNode(nodeId: string): ConeRecordKey {
    return new ConeRecordKey('node', routeOf([nodeId]));
  }

  /** The key of an edge's record, by its encoded edge key. */
  static forEdge(edgeKey: string): ConeRecordKey {
    return new ConeRecordKey('edge', routeOf([edgeKey]));
  }

  /** The key of one page of a writer's dot claims in one OR-Set. */
  static forDotPage(set: ConeDotSet, writerId: string, pageIndex: number): ConeRecordKey {
    return new ConeRecordKey('dot', routeOf([set, writerId, String(pageIndex)]));
  }

  /** The key of one page of a node's adjacency references in one direction. */
  static forAdjacencyPage(nodeId: string, direction: ConeDirection, pageIndex: number): ConeRecordKey {
    return new ConeRecordKey('adjacency', routeOf([nodeId, direction, String(pageIndex)]));
  }

  /** The key of a writer's entity admission tally: how many admissions its chain has indexed. */
  static forAdmissionTally(writerId: string): ConeRecordKey {
    return new ConeRecordKey('admission', routeOf(['tally', writerId]));
  }

  /** The key of a writer's entity admission at `ordinal` in its chain's admission order. */
  static forAdmission(writerId: string, ordinal: number): ConeRecordKey {
    return new ConeRecordKey('admission', routeOf(['entry', writerId, String(ordinal)]));
  }

  /** Stable text form, used as a map key. */
  toString(): string {
    return `${this.family}/${this.route}`;
  }

  equals(other: ConeRecordKey): boolean {
    return other.family === this.family && other.route === this.route;
  }
}

function routeOf(parts: readonly string[]): string {
  return RouteKey.fromElement(parts.join(FIELD_SEPARATOR)).toHex();
}
