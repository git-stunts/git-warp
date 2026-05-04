import NeighborProviderPort, {
  type Direction,
  type NeighborEdge,
  type NeighborOptions,
} from '../../../ports/NeighborProviderPort.ts';
import type {
  QueryNeighborEntry,
  QueryNeighborOptions,
  QueryReadModel,
} from './QueryReadModelProvider.ts';

type QueryDirection = QueryNeighborOptions['direction'];

function compareEdges(a: NeighborEdge, b: NeighborEdge): number {
  if (a.neighborId < b.neighborId) { return -1; }
  if (a.neighborId > b.neighborId) { return 1; }
  if (a.label < b.label) { return -1; }
  if (a.label > b.label) { return 1; }
  return 0;
}

function queryDirection(direction: Exclude<Direction, 'both'>): QueryDirection {
  return direction === 'out' ? 'outgoing' : 'incoming';
}

function singleQueryLabel(labels: Set<string> | undefined): string | null {
  if (labels === undefined || labels.size !== 1) {
    return null;
  }
  return [...labels][0] ?? null;
}

function queryOptions(direction: QueryDirection, labels: Set<string> | undefined): QueryNeighborOptions {
  const label = singleQueryLabel(labels);
  if (label === null) {
    return { direction };
  }
  return { direction, label };
}

function labelAllowed(entry: QueryNeighborEntry, labels: Set<string> | undefined): boolean {
  return labels === undefined || labels.has(entry.label);
}

function toNeighborEdge(entry: QueryNeighborEntry): NeighborEdge {
  return Object.freeze({
    neighborId: entry.nodeId,
    label: entry.label,
  });
}

function edgeKey(edge: NeighborEdge): string {
  return `${edge.neighborId}\0${edge.label}`;
}

function sorted(edges: readonly NeighborEdge[]): NeighborEdge[] {
  return [...edges].sort(compareEdges);
}

export default class QueryReadModelNeighborProvider extends NeighborProviderPort {
  readonly #readModel: QueryReadModel;

  constructor(readModel: QueryReadModel) {
    super();
    this.#readModel = readModel;
  }

  async getNeighbors(
    nodeId: string,
    direction: Direction,
    options?: NeighborOptions,
  ): Promise<NeighborEdge[]> {
    if (direction === 'both') {
      return await this.#bothNeighbors(nodeId, options?.labels);
    }
    return await this.#directionalNeighbors(nodeId, queryDirection(direction), options?.labels);
  }

  async hasNode(nodeId: string): Promise<boolean> {
    return await this.#readModel.nodeProps(nodeId) !== null;
  }

  async #bothNeighbors(nodeId: string, labels: Set<string> | undefined): Promise<NeighborEdge[]> {
    const deduped = new Map<string, NeighborEdge>();
    for (const edge of await this.#directionalNeighbors(nodeId, 'outgoing', labels)) {
      deduped.set(edgeKey(edge), edge);
    }
    for (const edge of await this.#directionalNeighbors(nodeId, 'incoming', labels)) {
      if (!deduped.has(edgeKey(edge))) {
        deduped.set(edgeKey(edge), edge);
      }
    }
    return sorted([...deduped.values()]);
  }

  async #directionalNeighbors(
    nodeId: string,
    direction: QueryDirection,
    labels: Set<string> | undefined,
  ): Promise<NeighborEdge[]> {
    const edges: NeighborEdge[] = [];
    for await (const entry of this.#readModel.neighbors(nodeId, queryOptions(direction, labels))) {
      if (labelAllowed(entry, labels)) {
        edges.push(toNeighborEdge(entry));
      }
    }
    return sorted(edges);
  }
}
