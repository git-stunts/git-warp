import type WarpState from '../state/WarpState.ts';
import type ConeEdgeRecord from './ConeEdgeRecord.ts';
import type ConeNodeRecord from './ConeNodeRecord.ts';
import ConeRecordKey from './ConeRecordKey.ts';
import { hydrateConeState } from './ConeStateHydration.ts';

/**
 * The records that decide one node's neighbourhood: the node, every edge key
 * registered with it, and the other endpoint of each edge (for liveness).
 * The state it hydrates answers questions about this node and its incident
 * edges exactly as a full reduction would.
 */
export default class ConeNeighbourhood {
  readonly node: ConeNodeRecord;
  readonly edges: readonly ConeEdgeRecord[];
  readonly neighbours: readonly ConeNodeRecord[];
  /** The adjacency pages read to find the edge keys. */
  readonly adjacencyKeys: readonly ConeRecordKey[];

  constructor(fields: {
    readonly node: ConeNodeRecord;
    readonly edges: readonly ConeEdgeRecord[];
    readonly neighbours: readonly ConeNodeRecord[];
    readonly adjacencyKeys: readonly ConeRecordKey[];
  }) {
    this.node = fields.node;
    this.edges = Object.freeze([...fields.edges]);
    this.neighbours = Object.freeze([...fields.neighbours]);
    this.adjacencyKeys = Object.freeze([...fields.adjacencyKeys]);
    Object.freeze(this);
  }

  /** A state holding exactly these records. */
  state(): WarpState {
    return hydrateConeState([this.node, ...this.neighbours], this.edges);
  }

  /** Every record key this neighbourhood was read from. */
  recordKeys(): readonly ConeRecordKey[] {
    return Object.freeze([
      this.node.key(),
      ...this.adjacencyKeys,
      ...this.edges.map((edge) => edge.key()),
      ...this.neighbours.map((neighbour) => ConeRecordKey.forNode(neighbour.nodeId)),
    ]);
  }
}
