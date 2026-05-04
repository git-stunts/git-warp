import { matchGlob } from '../../utils/matchGlob.ts';
import type {
  QueryNeighborEntry,
  QueryNeighborOptions,
  QueryNodeStreamRequest,
  QueryPropertyBag,
  QueryReadModel,
} from './QueryReadModelProvider.ts';
import type {
  QueryNodeEdgeSnapshot,
  QueryNodeSnapshot,
} from './QueryPlan.ts';

export type QueryReadModelVisibility = {
  readonly match: string | readonly string[];
  readonly expose?: readonly string[];
  readonly redact?: readonly string[];
};

type MutableQueryPropertyBag = { [key: string]: QueryPropertyBag[string] };

function toFilterSet(list: readonly string[] | undefined): Set<string> | null {
  return Array.isArray(list) && list.length > 0 ? new Set(list) : null;
}

function isKeyVisible(
  key: string,
  redactSet: Set<string> | null,
  exposeSet: Set<string> | null,
): boolean {
  if (redactSet !== null && redactSet.has(key)) { return false; }
  if (exposeSet !== null && !exposeSet.has(key)) { return false; }
  return true;
}

function nodeMatches(pattern: string | readonly string[], nodeId: string): boolean {
  if (typeof pattern === 'string') {
    return matchGlob(pattern, nodeId);
  }
  return pattern.some((entry) => matchGlob(entry, nodeId));
}

function filterProps(props: QueryPropertyBag, visibility: QueryReadModelVisibility): QueryPropertyBag {
  const redactSet = toFilterSet(visibility.redact);
  const exposeSet = toFilterSet(visibility.expose);
  const filtered: MutableQueryPropertyBag = {};
  for (const [key, value] of Object.entries(props)) {
    if (isKeyVisible(key, redactSet, exposeSet)) {
      filtered[key] = value;
    }
  }
  return Object.freeze(filtered);
}

function edgeEndpointVisible(
  edge: QueryNodeEdgeSnapshot,
  visibility: QueryReadModelVisibility,
): boolean {
  if (edge.to !== undefined) {
    return nodeMatches(visibility.match, edge.to);
  }
  if (edge.from !== undefined) {
    return nodeMatches(visibility.match, edge.from);
  }
  return true;
}

function visibleEdges(
  edges: ReadonlyArray<QueryNodeEdgeSnapshot>,
  visibility: QueryReadModelVisibility,
): ReadonlyArray<QueryNodeEdgeSnapshot> {
  const visible: QueryNodeEdgeSnapshot[] = [];
  for (const edge of edges) {
    if (edgeEndpointVisible(edge, visibility)) {
      visible.push(Object.freeze({ ...edge }));
    }
  }
  return Object.freeze(visible);
}

function visibleNode(
  node: QueryNodeSnapshot,
  visibility: QueryReadModelVisibility,
): QueryNodeSnapshot {
  return Object.freeze({
    id: node.id,
    props: filterProps(node.props, visibility),
    edgesOut: visibleEdges(node.edgesOut, visibility),
    edgesIn: visibleEdges(node.edgesIn, visibility),
  });
}

export default class VisibleQueryReadModel implements QueryReadModel {
  readonly stateHash: string;
  readonly #source: QueryReadModel;
  readonly #visibility: QueryReadModelVisibility;

  constructor(params: {
    readonly source: QueryReadModel;
    readonly visibility: QueryReadModelVisibility;
  }) {
    this.#source = params.source;
    this.#visibility = params.visibility;
    this.stateHash = params.source.stateHash;
  }

  async *nodes(request: QueryNodeStreamRequest): AsyncIterable<QueryNodeSnapshot> {
    for await (const node of this.#source.nodes(request)) {
      if (this.#isVisibleNode(node.id)) {
        yield visibleNode(node, this.#visibility);
      }
    }
  }

  async *neighbors(
    nodeId: string,
    options: QueryNeighborOptions,
  ): AsyncIterable<QueryNeighborEntry> {
    if (!this.#isVisibleNode(nodeId)) {
      return;
    }
    for await (const entry of this.#source.neighbors(nodeId, options)) {
      if (this.#isVisibleNode(entry.nodeId)) {
        yield Object.freeze({ nodeId: entry.nodeId, label: entry.label });
      }
    }
  }

  async nodeProps(nodeId: string): Promise<QueryPropertyBag | null> {
    if (!this.#isVisibleNode(nodeId)) {
      return null;
    }
    const props = await this.#source.nodeProps(nodeId);
    if (props === null) {
      return null;
    }
    return filterProps(props, this.#visibility);
  }

  #isVisibleNode(nodeId: string): boolean {
    return nodeMatches(this.#visibility.match, nodeId);
  }
}
