import type { SnapshotPropValue } from '../snapshot/SnapshotPropValue.ts';

export type QueryNodePropertyBag = Readonly<{ [key: string]: SnapshotPropValue }>;

export type QueryNodeEdgeSnapshot = {
  label: string;
  to?: string;
  from?: string;
};

/**
 * QueryPlan — frozen value object representing a fully accumulated query.
 *
 * The handoff between QueryBuilder (accumulates) and QueryRunner (executes).
 * Once constructed, the plan is immutable.
 */

/** Frozen snapshot of a node for use in where() predicates. */
export type QueryNodeSnapshot = {
  id: string;
  props: QueryNodePropertyBag;
  edgesOut: ReadonlyArray<QueryNodeEdgeSnapshot>;
  edgesIn: ReadonlyArray<QueryNodeEdgeSnapshot>;
};

/** Where-clause predicate operation. */
export type WhereOperation = {
  type: 'where';
  fn: (node: QueryNodeSnapshot) => boolean;
};

/** Edge traversal operation (outgoing or incoming). */
export type TraversalOperation = {
  type: 'outgoing' | 'incoming';
  label?: string;
  depth: [number, number];
};

/** Union of all query pipeline operations. */
export type QueryOperation = WhereOperation | TraversalOperation;

/** Aggregation specification. */
export type AggregateSpec = {
  count?: boolean;
  sum?: string;
  avg?: string;
  min?: string;
  max?: string;
};

export default class QueryPlan {
  readonly pattern: string | string[];
  readonly operations: readonly QueryOperation[];
  readonly select: readonly string[] | null;
  readonly aggregate: AggregateSpec | null;

  constructor(params: {
    pattern: string | string[];
    operations: QueryOperation[];
    select: string[] | null;
    aggregate: AggregateSpec | null;
  }) {
    this.pattern = params.pattern;
    this.operations = params.operations;
    this.select = params.select;
    this.aggregate = params.aggregate;
    Object.freeze(this);
  }
}
