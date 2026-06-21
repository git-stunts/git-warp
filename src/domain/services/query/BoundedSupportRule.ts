import QueryError from '../../errors/QueryError.ts';
import QueryPlan, { type QueryOperation, type TraversalOperation } from './QueryPlan.ts';

export type BoundedSupportSurface = 'query' | 'optic' | 'diff';
export type BoundedSupportKind = 'entity' | 'neighborhood' | 'global-discovery' | 'interval-diff';
export type BoundedSupportDirection = 'outgoing' | 'incoming';

export type BoundedSupportRuleFields = {
  readonly surface: BoundedSupportSurface;
  readonly kind: BoundedSupportKind;
  readonly reason: string;
  readonly rootNodeIds?: readonly string[];
  readonly maxDepth?: number;
  readonly directions?: readonly BoundedSupportDirection[];
};

const SUPPORT_SURFACES: readonly BoundedSupportSurface[] = Object.freeze(['query', 'optic', 'diff']);
const SUPPORT_KINDS: readonly BoundedSupportKind[] = Object.freeze([
  'entity',
  'neighborhood',
  'global-discovery',
  'interval-diff',
]);
const SUPPORT_DIRECTIONS: readonly BoundedSupportDirection[] = Object.freeze(['outgoing', 'incoming']);

/** Runtime-backed support law for a public read surface. */
export default class BoundedSupportRule {
  readonly surface: BoundedSupportSurface;
  readonly kind: BoundedSupportKind;
  readonly reason: string;
  readonly rootNodeIds: readonly string[];
  readonly maxDepth: number | undefined;
  readonly directions: readonly BoundedSupportDirection[];

  constructor(fields: BoundedSupportRuleFields) {
    const checkedFields = requireFields(fields);
    this.surface = requireSurface(checkedFields.surface);
    this.kind = requireKind(checkedFields.kind);
    this.reason = requireNonEmptyString(checkedFields.reason, 'reason');
    this.rootNodeIds = freezeStringList(checkedFields.rootNodeIds ?? [], 'rootNodeIds');
    this.maxDepth = optionalNonNegativeInteger(checkedFields.maxDepth, 'maxDepth');
    this.directions = freezeDirections(checkedFields.directions ?? []);
    Object.freeze(this);
  }

  static entityRead(fields: {
    readonly surface: BoundedSupportSurface;
    readonly nodeIds: readonly string[];
  }): BoundedSupportRule {
    return new BoundedSupportRule({
      surface: fields.surface,
      kind: 'entity',
      reason: 'exact node-id support',
      rootNodeIds: fields.nodeIds,
    });
  }

  static neighborhoodRead(fields: {
    readonly surface: BoundedSupportSurface;
    readonly rootNodeIds: readonly string[];
    readonly maxDepth: number;
    readonly directions: readonly BoundedSupportDirection[];
  }): BoundedSupportRule {
    return new BoundedSupportRule({
      surface: fields.surface,
      kind: 'neighborhood',
      reason: 'exact node-id traversal support',
      rootNodeIds: fields.rootNodeIds,
      maxDepth: fields.maxDepth,
      directions: fields.directions,
    });
  }

  static globalDiscovery(fields: {
    readonly surface: BoundedSupportSurface;
    readonly reason: string;
  }): BoundedSupportRule {
    return new BoundedSupportRule({
      surface: fields.surface,
      kind: 'global-discovery',
      reason: fields.reason,
    });
  }

  static fromQueryPlan(plan: QueryPlan): BoundedSupportRule {
    requireQueryPlan(plan);
    const exactNodeIds = exactNodeIdsForPattern(plan.pattern);
    if (exactNodeIds === null) {
      return BoundedSupportRule.globalDiscovery({
        surface: 'query',
        reason: 'query pattern requires discovery over the visible graph',
      });
    }

    const traversals = traversalOperations(plan.operations);
    if (traversals.length === 0) {
      return BoundedSupportRule.entityRead({
        surface: 'query',
        nodeIds: exactNodeIds,
      });
    }

    return BoundedSupportRule.neighborhoodRead({
      surface: 'query',
      rootNodeIds: exactNodeIds,
      maxDepth: maxTraversalDepth(traversals),
      directions: traversalDirections(traversals),
    });
  }

  isBounded(): boolean {
    return this.kind !== 'global-discovery';
  }

  requiresWholeGraphDiscovery(): boolean {
    return this.kind === 'global-discovery';
  }
}

function requireFields(fields: BoundedSupportRuleFields | null | undefined): BoundedSupportRuleFields {
  if (fields === null || fields === undefined) {
    throw new QueryError('BoundedSupportRule fields must be provided', {
      code: 'E_QUERY_SUPPORT_RULE',
    });
  }
  return fields;
}

function requireSurface(surface: BoundedSupportSurface): BoundedSupportSurface {
  if (!SUPPORT_SURFACES.includes(surface)) {
    throw new QueryError('BoundedSupportRule surface is unsupported', {
      code: 'E_QUERY_SUPPORT_RULE',
      context: { surface },
    });
  }
  return surface;
}

function requireKind(kind: BoundedSupportKind): BoundedSupportKind {
  if (!SUPPORT_KINDS.includes(kind)) {
    throw new QueryError('BoundedSupportRule kind is unsupported', {
      code: 'E_QUERY_SUPPORT_RULE',
      context: { kind },
    });
  }
  return kind;
}

function requireNonEmptyString(value: string, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new QueryError(`${field} must be a non-empty string`, {
      code: 'E_QUERY_SUPPORT_RULE',
      context: { field },
    });
  }
  return value.trim();
}

function optionalNonNegativeInteger(value: number | undefined, field: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value) || value < 0) {
    throw new QueryError(`${field} must be a non-negative integer`, {
      code: 'E_QUERY_SUPPORT_RULE',
      context: { field, value },
    });
  }
  return value;
}

function freezeStringList(values: readonly string[], field: string): readonly string[] {
  if (!Array.isArray(values)) {
    throw new QueryError(`${field} must be an array`, {
      code: 'E_QUERY_SUPPORT_RULE',
      context: { field },
    });
  }
  const normalized: string[] = [];
  for (const value of values) {
    normalized.push(requireNonEmptyString(value, field));
  }
  return Object.freeze([...new Set(normalized)].sort());
}

function freezeDirections(values: readonly BoundedSupportDirection[]): readonly BoundedSupportDirection[] {
  if (!Array.isArray(values)) {
    throw new QueryError('directions must be an array', {
      code: 'E_QUERY_SUPPORT_RULE',
    });
  }
  const normalized: BoundedSupportDirection[] = [];
  for (const value of values) {
    if (!SUPPORT_DIRECTIONS.includes(value)) {
      throw new QueryError('directions contains unsupported direction', {
        code: 'E_QUERY_SUPPORT_RULE',
        context: { direction: value },
      });
    }
    normalized.push(value);
  }
  return Object.freeze([...new Set(normalized)].sort());
}

function requireQueryPlan(plan: QueryPlan): QueryPlan {
  if (!(plan instanceof QueryPlan)) {
    throw new QueryError('fromQueryPlan requires a QueryPlan', {
      code: 'E_QUERY_SUPPORT_RULE',
    });
  }
  return plan;
}

function exactNodeIdsForPattern(pattern: string | readonly string[]): readonly string[] | null {
  if (typeof pattern === 'string') {
    const nodeId = exactPatternNodeId(pattern);
    if (nodeId === null) {
      return null;
    }
    return Object.freeze([nodeId]);
  }

  const exactIds: string[] = [];
  for (const entry of pattern) {
    const nodeId = exactPatternNodeId(entry);
    if (nodeId === null) {
      return null;
    }
    exactIds.push(nodeId);
  }
  return Object.freeze([...new Set(exactIds)].sort());
}

function exactPatternNodeId(pattern: string): string | null {
  if (pattern.includes('*')) {
    return null;
  }
  return requireNonEmptyString(pattern, 'pattern');
}

function traversalOperations(operations: readonly QueryOperation[]): readonly TraversalOperation[] {
  const traversals: TraversalOperation[] = [];
  for (const operation of operations) {
    if (isTraversalOperation(operation)) {
      traversals.push(operation);
    }
  }
  return Object.freeze(traversals);
}

function isTraversalOperation(operation: QueryOperation): operation is TraversalOperation {
  return operation.type === 'outgoing' || operation.type === 'incoming';
}

function maxTraversalDepth(operations: readonly TraversalOperation[]): number {
  let maxDepth = 0;
  for (const operation of operations) {
    const candidate = operation.depth[1];
    if (candidate > maxDepth) {
      maxDepth = candidate;
    }
  }
  return maxDepth;
}

function traversalDirections(operations: readonly TraversalOperation[]): readonly BoundedSupportDirection[] {
  const directions: BoundedSupportDirection[] = [];
  for (const operation of operations) {
    directions.push(operation.type);
  }
  return Object.freeze([...new Set(directions)].sort());
}
