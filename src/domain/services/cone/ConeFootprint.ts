import type Patch from '../../types/Patch.ts';
import ConeDotPage from './ConeDotPage.ts';
import type ConeDotMention from './ConeDotMention.ts';
import ConeFootprintCollector from './ConeFootprintCollector.ts';
import ConeRecordKey, { type ConeDotSet } from './ConeRecordKey.ts';

const NO_DOTS: ReadonlySet<string> = Object.freeze(new Set<string>());

/** One writer's dot page an operation of the patch claims a dot on. */
export type ConeDotPageAddress = {
  readonly set: ConeDotSet;
  readonly writerId: string;
  readonly pageIndex: number;
};

/**
 * The elements one patch's operations name, and nothing else.
 *
 * Every join rule is per element: an OR-Set add or remove touches the dots
 * of the element it names, a property set touches one register, and node
 * and edge lifecycle events belong to the element they advance. An edge
 * operation also names both endpoints, because a new edge key joins their
 * adjacency. The footprint additionally carries each dot claim, so a fold
 * can refuse the one case per-element tombstones cannot represent.
 */
export default class ConeFootprint {
  readonly nodes: ReadonlySet<string>;
  readonly edges: ReadonlySet<string>;
  readonly mentions: readonly ConeDotMention[];
  readonly #nodeTombstones: ReadonlyMap<string, ReadonlySet<string>>;
  readonly #edgeTombstones: ReadonlyMap<string, ReadonlySet<string>>;

  private constructor(collector: ConeFootprintCollector) {
    const parts = collector.parts();
    this.nodes = Object.freeze(new Set(parts.nodes));
    this.edges = Object.freeze(new Set(parts.edges));
    this.mentions = Object.freeze([...parts.mentions]);
    this.#nodeTombstones = parts.nodeTombstones;
    this.#edgeTombstones = parts.edgeTombstones;
    Object.freeze(this);
  }

  /** The footprint of a decoded patch. */
  static of(patch: Patch): ConeFootprint {
    const collector = new ConeFootprintCollector();
    for (const op of patch.ops) {
      collector.collect(op);
    }
    return new ConeFootprint(collector);
  }

  /** Dots this patch's removes of `nodeId` name. */
  nodeTombstones(nodeId: string): ReadonlySet<string> {
    return this.#nodeTombstones.get(nodeId) ?? NO_DOTS;
  }

  /** Dots this patch's removes of the edge name. */
  edgeTombstones(edgeKey: string): ReadonlySet<string> {
    return this.#edgeTombstones.get(edgeKey) ?? NO_DOTS;
  }

  /** The dot pages this patch claims dots on, without duplicates. */
  dotPages(): readonly ConeDotPageAddress[] {
    const pages = new Map<string, ConeDotPageAddress>();
    for (const mention of this.mentions) {
      const address = {
        set: mention.set, writerId: mention.dot.writerId, pageIndex: ConeDotPage.pageOf(mention.dot.counter),
      };
      pages.set(ConeRecordKey.forDotPage(address.set, address.writerId, address.pageIndex).toString(), address);
    }
    return Object.freeze([...pages.values()]);
  }

  /** Every record a fold of this patch must read before applying it. */
  recordKeys(): readonly ConeRecordKey[] {
    return Object.freeze([
      ...[...this.nodes].map((nodeId) => ConeRecordKey.forNode(nodeId)),
      ...[...this.edges].map((edgeKey) => ConeRecordKey.forEdge(edgeKey)),
      ...this.dotPages().map((page) => ConeRecordKey.forDotPage(page.set, page.writerId, page.pageIndex)),
    ]);
  }
}
