import PatchError from '../../errors/PatchError.ts';
import { encodeEdgeKey } from '../KeyCodec.ts';
import NodeRemovalObservation from '../NodeRemovalObservation.ts';
import type ConeBasis from './ConeBasis.ts';
import type ConeEdgeRecord from './ConeEdgeRecord.ts';
import type ConeNodeRecord from './ConeNodeRecord.ts';
import ConeRecordKey from './ConeRecordKey.ts';
import type ConeReader from './ConeReader.ts';
import { hydrateConeState } from './ConeStateHydration.ts';
import type ConeWriteTargets from './ConeWriteTargets.ts';

/** What a node removal must observe: only the node (`warn`), or also its incident data. */
export type ConeRemovalPolicy = 'reject' | 'cascade' | 'warn';

/**
 * The read-before-write a public write needs, taken from the lane's cone
 * records at one advanced basis (#1039): the live dots and attached data of
 * each node it removes, the liveness of each node and edge it attaches
 * content to, and the live dots of each edge it removes. It reads only the
 * targets' records, never history.
 */
export default class ConeWriteBasis {
  readonly #removals: ReadonlyMap<string, NodeRemovalObservation>;
  readonly #edges: ReadonlyMap<string, ConeEdgeRecord>;
  /** Records of the nodes whose registers the write sets, for its race check. */
  readonly registerOwners: ReadonlyMap<string, ConeNodeRecord>;

  private constructor(
    removals: ReadonlyMap<string, NodeRemovalObservation>,
    edges: ReadonlyMap<string, ConeEdgeRecord>,
    registerOwners: ReadonlyMap<string, ConeNodeRecord>,
  ) {
    this.#removals = removals;
    this.#edges = edges;
    this.registerOwners = registerOwners;
    Object.freeze(this);
  }

  static async capture(fields: {
    readonly reader: ConeReader;
    readonly basis: ConeBasis;
    readonly targets: ConeWriteTargets;
    readonly policy: ConeRemovalPolicy;
  }): Promise<ConeWriteBasis> {
    const removals = new Map<string, NodeRemovalObservation>();
    for (const nodeId of fields.targets.nodes) {
      removals.set(nodeId, await observeNode(fields, nodeId));
    }
    const edges = new Map<string, ConeEdgeRecord>();
    for (const edge of fields.targets.edges) {
      const edgeKey = encodeEdgeKey(edge.from, edge.to, edge.label);
      edges.set(edgeKey, await fields.reader.edge(fields.basis.root, edgeKey));
    }
    const owners = await fields.reader.records(fields.basis.root, fields.targets.registerNodes.map((nodeId) => ConeRecordKey.forNode(nodeId)));
    return new ConeWriteBasis(removals, edges, new Map(fields.targets.registerNodes.map((nodeId) => [nodeId, owners.node(nodeId)])));
  }

  /** Whether a target node is alive; a node outside the targets is unobserved. */
  containsNode(nodeId: string): boolean {
    return this.#removals.get(nodeId)?.isObservedAlive() === true;
  }

  /** Whether a target edge is a live OR-Set member; an edge outside the targets is unobserved. */
  containsEdge(from: string, to: string, label: string): boolean {
    return this.#edges.get(encodeEdgeKey(from, to, label))?.isAlive() === true;
  }

  /** The removal observation of a target node. */
  node(nodeId: string): NodeRemovalObservation {
    const observation = this.#removals.get(nodeId);
    if (observation === undefined) {
      throw unobserved();
    }
    return observation;
  }

  /** The live add dots of a target edge, which an edge remove observes. */
  edgeDots(from: string, to: string, label: string): readonly string[] {
    const edge = this.#edges.get(encodeEdgeKey(from, to, label));
    if (edge === undefined) {
      throw unobserved();
    }
    return Object.freeze([...edge.liveDots()].sort());
  }
}

async function observeNode(
  fields: { readonly reader: ConeReader; readonly basis: ConeBasis; readonly policy: ConeRemovalPolicy },
  nodeId: string,
): Promise<NodeRemovalObservation> {
  if (fields.policy === 'warn') {
    const node = await fields.reader.node(fields.basis.root, nodeId);
    return NodeRemovalObservation.fromState(hydrateConeState([node], []), nodeId);
  }
  const neighbourhood = await fields.reader.neighbourhoodRecords(fields.basis.root, nodeId);
  return NodeRemovalObservation.fromState(neighbourhood.state(), nodeId);
}

function unobserved(): PatchError {
  return new PatchError('The write did not observe this entity before lowering', { code: 'E_PATCH_NO_STATE' });
}
