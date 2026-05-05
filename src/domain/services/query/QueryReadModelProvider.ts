import type {
  QueryNodePropertyBag,
  QueryNodeSnapshot,
} from './QueryPlan.ts';

export type QueryPropertyBag = QueryNodePropertyBag;

export type QueryNodeStreamRequest = {
  readonly pattern: string | readonly string[];
  readonly select: readonly string[] | null;
};

export type QueryNeighborOptions = {
  readonly label?: string;
  readonly direction: 'outgoing' | 'incoming';
};

export type QueryNeighborEntry = {
  readonly nodeId: string;
  readonly label: string;
};

export interface QueryReadModel {
  readonly stateHash: string;
  nodes(request: QueryNodeStreamRequest): AsyncIterable<QueryNodeSnapshot>;
  neighbors(
    nodeId: string,
    options: QueryNeighborOptions,
  ): AsyncIterable<QueryNeighborEntry>;
  nodeProps(nodeId: string): Promise<QueryPropertyBag | null>;
}

export interface QueryReadModelProvider {
  openQueryReadModel(): Promise<QueryReadModel>;
}
