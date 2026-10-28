import { compareStrings } from '../../utils/StringComparison.ts';
import { encodeEdgeKey } from '../KeyCodec.ts';

/** One edge a write must observe before it lowers. */
export type ConeWriteEdgeTarget = {
  readonly from: string;
  readonly to: string;
  readonly label: string;
};

/**
 * The entities a write reads before it lowers its intents (#1039): nodes it
 * removes or attaches content to, and edges it removes or attaches content
 * to. Blind intents (adds and property sets) contribute nothing.
 */
export default class ConeWriteTargets {
  readonly nodes: readonly string[];
  readonly edges: readonly ConeWriteEdgeTarget[];

  constructor(fields: { readonly nodes: readonly string[]; readonly edges: readonly ConeWriteEdgeTarget[] }) {
    this.nodes = Object.freeze([...new Set(fields.nodes)].sort(compareStrings));
    const edges = new Map(fields.edges.map((edge) => [encodeEdgeKey(edge.from, edge.to, edge.label), edge]));
    this.edges = Object.freeze([...edges].sort(([left], [right]) => compareStrings(left, right))
      .map(([, edge]) => Object.freeze({ from: edge.from, to: edge.to, label: edge.label })));
    Object.freeze(this);
  }

  isEmpty(): boolean {
    return this.nodes.length === 0 && this.edges.length === 0;
  }
}
