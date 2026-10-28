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
 * to. `registerNodes` are nodes whose properties it sets by name (property
 * sets and supplied-subject entity admissions): their records say whether
 * the write races a concurrent value it never observed. Node and edge adds
 * contribute nothing.
 */
export default class ConeWriteTargets {
  readonly nodes: readonly string[];
  readonly edges: readonly ConeWriteEdgeTarget[];
  readonly registerNodes: readonly string[];

  constructor(fields: {
    readonly nodes: readonly string[];
    readonly edges: readonly ConeWriteEdgeTarget[];
    readonly registerNodes?: readonly string[];
  }) {
    this.nodes = Object.freeze([...new Set(fields.nodes)].sort(compareStrings));
    this.registerNodes = Object.freeze([...new Set(fields.registerNodes ?? [])].sort(compareStrings));
    const edges = new Map(fields.edges.map((edge) => [encodeEdgeKey(edge.from, edge.to, edge.label), edge]));
    this.edges = Object.freeze([...edges].sort(([left], [right]) => compareStrings(left, right))
      .map(([, edge]) => Object.freeze({ from: edge.from, to: edge.to, label: edge.label })));
    Object.freeze(this);
  }

  isEmpty(): boolean {
    return !this.readsRecords() && this.registerNodes.length === 0;
  }

  /** Whether the write reads records to lower (removes and content), rather than only to classify. */
  readsRecords(): boolean {
    return this.nodes.length > 0 || this.edges.length > 0;
  }
}
