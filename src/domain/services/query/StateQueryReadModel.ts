import type NeighborProviderPort from '../../../ports/NeighborProviderPort.ts';
import type { NeighborEdge } from '../../../ports/NeighborProviderPort.ts';
import type { SnapshotPropValue } from '../snapshot/SnapshotPropValue.ts';
import type WarpState from '../state/WarpState.ts';
import { createSnapshotPropValue } from '../ImmutableSnapshot.ts';
import { decodeEdgeKey, decodePropKey } from '../KeyCodec.ts';
import { matchGlob } from '../../utils/matchGlob.ts';
import type {
  QueryNeighborEntry,
  QueryNeighborOptions,
  QueryNodeStreamRequest,
  QueryPropertyBag,
  QueryReadModel,
} from './QueryReadModelProvider.ts';
import type { QueryNodeSnapshot } from './QueryPlan.ts';

type MutablePropertyBag = { [key: string]: SnapshotPropValue };

type ObserverVisibility = {
  readonly match: string | readonly string[];
  readonly expose?: readonly string[];
  readonly redact?: readonly string[];
};

type StateQueryReadModelParams = {
  readonly state: WarpState;
  readonly stateHash: string;
  readonly visibility: ObserverVisibility;
  readonly neighborProvider?: NeighborProviderPort;
};

type DecodedEdgeEndpoints = {
  readonly from: string;
  readonly to: string;
};

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

function emptyNodeSnapshot(id: string): QueryNodeSnapshot {
  return Object.freeze({
    id,
    props: Object.freeze({}),
    edgesOut: Object.freeze([]),
    edgesIn: Object.freeze([]),
  });
}

function nodeMatches(pattern: string | readonly string[], nodeId: string): boolean {
  if (typeof pattern === 'string') {
    return matchGlob(pattern, nodeId);
  }
  return pattern.some((entry) => matchGlob(entry, nodeId));
}

function liveElements(state: WarpState, kind: 'node' | 'edge'): Iterable<string> {
  const alive = kind === 'node' ? state.nodeAlive : state.edgeAlive;
  return {
    *[Symbol.iterator](): Iterator<string> {
      for (const element of alive.entries.keys()) {
        if (alive.contains(element)) {
          yield element;
        }
      }
    },
  };
}

function providerDirection(direction: 'outgoing' | 'incoming'): 'out' | 'in' {
  return direction === 'outgoing' ? 'out' : 'in';
}

function labelMatches(label: string, filter: string | undefined): boolean {
  return filter === undefined || label === filter;
}

function nodeEdgeEntry(edge: NeighborEdge): QueryNeighborEntry {
  return Object.freeze({
    nodeId: edge.neighborId,
    label: edge.label,
  });
}

function asyncIterableFrom<T>(source: Iterable<T>): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      const iterator = source[Symbol.iterator]();
      return {
        next(): Promise<IteratorResult<T>> {
          return Promise.resolve(iterator.next());
        },
      };
    },
  };
}

export default class StateQueryReadModel implements QueryReadModel {
  readonly stateHash: string;
  readonly #state: WarpState;
  readonly #visibility: ObserverVisibility;
  readonly #neighborProvider: NeighborProviderPort | null;

  constructor(params: StateQueryReadModelParams) {
    this.#state = params.state;
    this.stateHash = params.stateHash;
    this.#visibility = params.visibility;
    this.#neighborProvider = params.neighborProvider ?? null;
  }

  nodes(request: QueryNodeStreamRequest): AsyncIterable<QueryNodeSnapshot> {
    return asyncIterableFrom(this.#visibleNodes(request));
  }

  async *neighbors(
    nodeId: string,
    options: QueryNeighborOptions,
  ): AsyncIterable<QueryNeighborEntry> {
    if (!this.#isVisibleNode(nodeId)) { return; }
    if (this.#neighborProvider !== null) {
      yield* this.#indexedNeighbors(nodeId, options);
      return;
    }
    yield* this.#linearNeighbors(nodeId, options);
  }

  nodeProps(nodeId: string): Promise<QueryPropertyBag | null> {
    if (!this.#isVisibleNode(nodeId)) { return Promise.resolve(null); }

    const redactSet = toFilterSet(this.#visibility.redact);
    const exposeSet = toFilterSet(this.#visibility.expose);
    const props: MutablePropertyBag = {};

    for (const [propKey, register] of this.#state.prop) {
      const decoded = decodePropKey(propKey);
      if (
        decoded.nodeId === nodeId &&
        isKeyVisible(decoded.propKey, redactSet, exposeSet)
      ) {
        props[decoded.propKey] = createSnapshotPropValue(register.value);
      }
    }

    return Promise.resolve(Object.freeze(props));
  }

  async *#indexedNeighbors(
    nodeId: string,
    options: QueryNeighborOptions,
  ): AsyncIterable<QueryNeighborEntry> {
    if (this.#neighborProvider === null) { return; }
    const neighbors = await this.#neighborProvider.getNeighbors(
      nodeId,
      providerDirection(options.direction),
      options.label === undefined ? undefined : { labels: new Set([options.label]) },
    );

    for (const edge of neighbors) {
      if (this.#isVisibleNode(edge.neighborId)) {
        yield nodeEdgeEntry(edge);
      }
    }
  }

  #linearNeighbors(
    nodeId: string,
    options: QueryNeighborOptions,
  ): AsyncIterable<QueryNeighborEntry> {
    return asyncIterableFrom(this.#visibleLinearNeighbors(nodeId, options));
  }

  *#visibleNodes(request: QueryNodeStreamRequest): Iterable<QueryNodeSnapshot> {
    for (const nodeId of liveElements(this.#state, 'node')) {
      if (this.#isVisibleNode(nodeId) && nodeMatches(request.pattern, nodeId)) {
        yield emptyNodeSnapshot(nodeId);
      }
    }
  }

  *#visibleLinearNeighbors(
    nodeId: string,
    options: QueryNeighborOptions,
  ): Iterable<QueryNeighborEntry> {
    for (const edgeKey of liveElements(this.#state, 'edge')) {
      const entry = this.#linearNeighborForEdge(edgeKey, nodeId, options);
      if (entry !== null) {
        yield entry;
      }
    }
  }

  #linearNeighborForEdge(
    edgeKey: string,
    nodeId: string,
    options: QueryNeighborOptions,
  ): QueryNeighborEntry | null {
    const edge = decodeEdgeKey(edgeKey);
    const neighborId = options.direction === 'outgoing'
      ? this.#outgoingNeighbor(nodeId, edge)
      : this.#incomingNeighbor(nodeId, edge);
    if (
      neighborId === null ||
      !labelMatches(edge.label, options.label) ||
      !this.#isVisibleNode(neighborId)
    ) {
      return null;
    }
    return Object.freeze({ nodeId: neighborId, label: edge.label });
  }

  #outgoingNeighbor(
    nodeId: string,
    edge: DecodedEdgeEndpoints,
  ): string | null {
    return edge.from === nodeId ? edge.to : null;
  }

  #incomingNeighbor(
    nodeId: string,
    edge: DecodedEdgeEndpoints,
  ): string | null {
    return edge.to === nodeId ? edge.from : null;
  }

  #isVisibleNode(nodeId: string): boolean {
    return this.#state.nodeAlive.contains(nodeId) &&
      nodeMatches(this.#visibility.match, nodeId);
  }
}
