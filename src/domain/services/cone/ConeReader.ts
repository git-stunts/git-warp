import type ConeRecordStorePort from '../../../ports/ConeRecordStorePort.ts';
import type { VisibleStateReader } from '../../types/VisibleStateReader.ts';
import { createStateReader } from '../state/StateReader.ts';
import { CONE_ADJACENCY_PAGE_SIZE, type default as ConeAdjacencyPage } from './ConeAdjacencyPage.ts';
import type ConeEdgeRecord from './ConeEdgeRecord.ts';
import type ConeNodeRecord from './ConeNodeRecord.ts';
import ConeRecordKey, { type ConeDirection } from './ConeRecordKey.ts';
import type ConeRecordSnapshot from './ConeRecordSnapshot.ts';
import type ConeRoot from './ConeRoot.ts';
import ConeNeighbourhood from './ConeNeighbourhood.ts';

const DIRECTIONS: readonly ConeDirection[] = ['out', 'in'];

/**
 * Reads cone records under one root.
 *
 * Record reads cost one record each. A neighbourhood read costs the node's
 * record, its adjacency pages, the referenced edge records and the neighbour
 * records that decide endpoint liveness; it is degree-bounded, never
 * graph-bounded. Visibility is computed by the existing state reader over a
 * state holding only those records, so the rules match a full reduction.
 */
export default class ConeReader {
  readonly #store: ConeRecordStorePort;

  constructor(store: ConeRecordStorePort) {
    this.#store = store;
  }

  /** The records stored at `keys` under `root`, read in one batch. */
  async records(root: ConeRoot, keys: readonly ConeRecordKey[]): Promise<ConeRecordSnapshot> {
    return await this.#store.readRecords(root, keys);
  }

  async node(root: ConeRoot, nodeId: string): Promise<ConeNodeRecord> {
    return (await this.#store.readRecords(root, [ConeRecordKey.forNode(nodeId)])).node(nodeId);
  }

  async edge(root: ConeRoot, edgeKey: string): Promise<ConeEdgeRecord> {
    return (await this.#store.readRecords(root, [ConeRecordKey.forEdge(edgeKey)])).edge(edgeKey);
  }

  /** One page of the edge keys registered with `nodeId` in `direction`. */
  async adjacencyPage(root: ConeRoot, nodeId: string, page: { readonly direction: ConeDirection; readonly index: number }): Promise<ConeAdjacencyPage> {
    const key = ConeRecordKey.forAdjacencyPage(nodeId, page.direction, page.index);
    return (await this.#store.readRecords(root, [key])).adjacencyPage(nodeId, page.direction, page.index);
  }

  /**
   * A state reader that answers questions about `nodeId` and its incident
   * edges exactly as a reader over the full state would. Questions about any
   * other entity are outside its cone.
   */
  async neighbourhood(root: ConeRoot, nodeId: string): Promise<VisibleStateReader> {
    return createStateReader((await this.neighbourhoodRecords(root, nodeId)).state());
  }

  /** The node's record, its incident edge records and its neighbours' records. */
  async neighbourhoodRecords(root: ConeRoot, nodeId: string): Promise<ConeNeighbourhood> {
    const node = await this.node(root, nodeId);
    const keys = DIRECTIONS.flatMap((direction) => pageKeys(node, direction));
    const edgeKeys = await this.#incidentEdgeKeys(root, node, keys);
    const edges = await this.#store.readRecords(root, edgeKeys.map((edgeKey) => ConeRecordKey.forEdge(edgeKey)));
    const edgeRecords = edgeKeys.map((edgeKey) => edges.edge(edgeKey));
    const neighbourIds = [...new Set(edgeRecords.flatMap((edge) => [edge.from, edge.to]))].filter((id) => id !== nodeId);
    const neighbours = await this.#store.readRecords(root, neighbourIds.map((id) => ConeRecordKey.forNode(id)));
    return new ConeNeighbourhood({
      node,
      edges: edgeRecords,
      neighbours: neighbourIds.map((id) => neighbours.node(id)),
      adjacencyKeys: keys.map((page) => page.key),
    });
  }

  async #incidentEdgeKeys(root: ConeRoot, node: ConeNodeRecord, keys: readonly PageKey[]): Promise<string[]> {
    const pages = await this.#store.readRecords(root, keys.map((page) => page.key));
    const edgeKeys = keys.flatMap((page) => pages.adjacencyPage(node.nodeId, page.direction, page.index).edgeKeys);
    return [...new Set(edgeKeys)];
  }
}

type PageKey = { readonly key: ConeRecordKey; readonly direction: ConeDirection; readonly index: number };

function pageKeys(node: ConeNodeRecord, direction: ConeDirection): PageKey[] {
  const count = Math.ceil(node.degree(direction) / CONE_ADJACENCY_PAGE_SIZE);
  return Array.from({ length: count }, (_unused, index) => ({
    key: ConeRecordKey.forAdjacencyPage(node.nodeId, direction, index), direction, index,
  }));
}
