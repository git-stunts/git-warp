import type Patch from '../../types/Patch.ts';
import ConeFootprint from './ConeFootprint.ts';
import ConeRecordKey from './ConeRecordKey.ts';
import type ConeReader from './ConeReader.ts';
import type ConeRoot from './ConeRoot.ts';

/**
 * The nodes and edges a strand's own patches name (#1039), and the check a
 * settlement preview makes with them: the strand's intents still lower the
 * same way at the target's current basis when every one of those elements
 * has the same join state there as at the strand's base. It reads those
 * elements' records under both roots and nothing else.
 */
export default class ConeSettlementFootprint {
  readonly nodes: ReadonlySet<string>;
  readonly edges: ReadonlySet<string>;

  private constructor(nodes: ReadonlySet<string>, edges: ReadonlySet<string>) {
    this.nodes = Object.freeze(new Set(nodes));
    this.edges = Object.freeze(new Set(edges));
    Object.freeze(this);
  }

  static empty(): ConeSettlementFootprint {
    return new ConeSettlementFootprint(new Set(), new Set());
  }

  /** This footprint with the elements `patch` names. */
  including(patch: Patch): ConeSettlementFootprint {
    const footprint = ConeFootprint.of(patch);
    return new ConeSettlementFootprint(new Set([...this.nodes, ...footprint.nodes]), new Set([...this.edges, ...footprint.edges]));
  }

  /** True when every element of the footprint has the same join state under `base` and `target`. */
  async unchangedBetween(reader: ConeReader, roots: { readonly base: ConeRoot; readonly target: ConeRoot }): Promise<boolean> {
    const keys = [
      ...[...this.nodes].map((nodeId) => ConeRecordKey.forNode(nodeId)),
      ...[...this.edges].map((edgeKey) => ConeRecordKey.forEdge(edgeKey)),
    ];
    const [base, target] = [await reader.records(roots.base, keys), await reader.records(roots.target, keys)];
    return [...this.nodes].every((nodeId) => base.node(nodeId).sameElementState(target.node(nodeId)))
      && [...this.edges].every((edgeKey) => base.edge(edgeKey).equals(target.edge(edgeKey)));
  }
}
