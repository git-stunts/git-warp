/**
 * NeighborProvider backed by in-memory adjacency maps.
 *
 * Wraps the { outgoing, incoming } Maps produced by _buildAdjacency().
 * Adjacency lists are pre-sorted at construction by (neighborId, label)
 * using strict codepoint comparison. Label filtering via Set.has() in-memory.
 *
 * @module domain/services/query/AdjacencyNeighborProvider
 */

import NeighborProviderPort, { type Direction, type NeighborOptions, type NeighborEdge, type LatencyClass } from '../../../ports/NeighborProviderPort.ts';
import QueryError from '../../errors/QueryError.ts';

type AdjEdge = { neighborId: string; label: string };
type AdjMap = Map<string, AdjEdge[]>;

function edgeCmp(a: AdjEdge, b: AdjEdge): number {
  if (a.neighborId < b.neighborId) { return -1; }
  if (a.neighborId > b.neighborId) { return 1; }
  if (a.label < b.label) { return -1; }
  if (a.label > b.label) { return 1; }
  return 0;
}

function sortAdjacencyMap(adjMap: AdjMap): AdjMap {
  const result: AdjMap = new Map();
  for (const [nodeId, edges] of adjMap) {
    result.set(nodeId, edges.slice().sort(edgeCmp));
  }
  return result;
}

function filterByLabels(edges: AdjEdge[], labels: Set<string> | undefined): AdjEdge[] {
  if (labels === undefined) { return edges; }
  return edges.filter((e) => labels.has(e.label));
}

function mergeSorted(a: AdjEdge[], b: AdjEdge[]): AdjEdge[] {
  const result: AdjEdge[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const ai = a[i]!;
    const bj = b[j]!;
    const cmp = edgeCmp(ai, bj);
    result.push(cmp <= 0 ? ai : bj);
    if (cmp <= 0) { i++; }
    if (cmp >= 0) { j++; }
  }
  for (let k = i; k < a.length; k++) { result.push(a[k]!); }
  for (let k = j; k < b.length; k++) { result.push(b[k]!); }
  return result;
}

export default class AdjacencyNeighborProvider extends NeighborProviderPort {
  private readonly _outgoing: AdjMap;
  private readonly _incoming: AdjMap;
  private readonly _aliveNodes: Set<string>;

  constructor(params: { outgoing: AdjMap; incoming: AdjMap; aliveNodes: Set<string> }) {
    super();
    const { outgoing, incoming, aliveNodes } = params;
    if (aliveNodes === undefined || aliveNodes === null) {
      throw new QueryError(
        'AdjacencyNeighborProvider: aliveNodes is required',
        { code: 'E_ADJACENCY_NO_ALIVE_NODES' },
      );
    }
    this._outgoing = sortAdjacencyMap(outgoing);
    this._incoming = sortAdjacencyMap(incoming);
    this._aliveNodes = aliveNodes;
  }

  getNeighbors(nodeId: string, direction: Direction, options?: NeighborOptions): Promise<NeighborEdge[]> {
    const labels = options?.labels;
    return Promise.resolve(this._resolveEdges(nodeId, direction, labels));
  }

  private _filteredEdges(adjMap: AdjMap, nodeId: string, labels: Set<string> | undefined): AdjEdge[] {
    return filterByLabels(adjMap.get(nodeId) ?? [], labels);
  }

  private _resolveEdges(nodeId: string, direction: Direction, labels: Set<string> | undefined): AdjEdge[] {
    if (direction === 'out') { return this._filteredEdges(this._outgoing, nodeId, labels); }
    if (direction === 'in') { return this._filteredEdges(this._incoming, nodeId, labels); }
    return mergeSorted(
      this._filteredEdges(this._outgoing, nodeId, labels),
      this._filteredEdges(this._incoming, nodeId, labels),
    );
  }

  hasNode(nodeId: string): Promise<boolean> {
    return Promise.resolve(this._aliveNodes.has(nodeId));
  }

  override get latencyClass(): LatencyClass {
    return 'sync';
  }
}
