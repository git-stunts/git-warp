/**
 * QueryBuilder — fluent query accumulator for a query read model.
 *
 * Pure accumulator: builder methods accumulate query state into a
 * QueryPlan, then run() delegates execution to QueryRunner.
 */

import QueryError from '../../errors/QueryError.ts';
import ImmutableBytes from '../snapshot/ImmutableBytes.ts';
import type { SnapshotPropValue } from '../snapshot/SnapshotPropValue.ts';
import type { AggregateResult } from './QueryAggregation.ts';
import BoundedSupportRule from './BoundedSupportRule.ts';
import SupportFragmentPlan from './SupportFragmentPlan.ts';
import QueryPlan, { type AggregateSpec, type QueryNodeSnapshot, type QueryOperation } from './QueryPlan.ts';
import QueryRunner, { type QueryResult } from './QueryRunner.ts';
import type { QueryReadModelProvider } from './QueryReadModelProvider.ts';

const DEFAULT_PATTERN = '*';

type NumericAggregateKey = 'sum' | 'avg' | 'min' | 'max';

const NUMERIC_AGGREGATE_KEYS: readonly NumericAggregateKey[] = ['sum', 'avg', 'min', 'max'];

type QueryWhereObject = Readonly<{ [key: string]: SnapshotPropValue }>;
type QueryWhereCandidate = ((node: QueryNodeSnapshot) => boolean) | SnapshotPropValue;
type QueryPrimitive = string | number | boolean | null;

function assertMatchPattern(pattern: string | string[]): void {
  const isString = typeof pattern === 'string';
  const isStringArray = Array.isArray(pattern) && pattern.every((p) => typeof p === 'string');
  if (!isString && !isStringArray) {
    throw new QueryError('match() expects a string pattern or array of string patterns', {
      code: 'E_QUERY_MATCH_TYPE',
      context: { receivedType: typeof pattern },
    });
  }
}

function createPredicate(fn: QueryWhereCandidate): (node: QueryNodeSnapshot) => boolean {
  if (isQueryWhereObject(fn)) {
    return objectToPredicate(fn);
  }
  if (typeof fn === 'function') {
    return fn;
  }

  throw new QueryError('where() expects a predicate function or object', {
    code: 'E_QUERY_WHERE_TYPE',
    context: { receivedType: typeof fn },
  });
}

function isQueryWhereObject(value: QueryWhereCandidate): value is QueryWhereObject {
  return value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof ImmutableBytes);
}

function assertAggregateSpec(spec: AggregateSpec): void {
  if (
    spec === null ||
    typeof spec !== 'object' ||
    Array.isArray(spec) ||
    spec instanceof ImmutableBytes
  ) {
    throw new QueryError('aggregate() expects an object', {
      code: 'E_QUERY_AGGREGATE_TYPE',
      context: { receivedType: typeof spec },
    });
  }
}

function isPrimitive(value: SnapshotPropValue): value is QueryPrimitive {
  return value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean';
}

function objectToPredicate(obj: QueryWhereObject): (node: QueryNodeSnapshot) => boolean {
  const entries = Object.entries(obj);
  for (const [key, value] of entries) {
    if (!isPrimitive(value)) {
      throw new QueryError(
        'where() object shorthand only accepts primitive property values',
        {
          code: 'E_QUERY_WHERE_VALUE_TYPE',
          context: { key, receivedType: typeof value },
        }
      );
    }
  }
  return ({ props }) => {
    for (const [key, value] of entries) {
      if (!(key in props) || props[key] !== value) { return false; }
    }
    return true;
  };
}

function assertLabel(label: string | undefined): void {
  if (label === undefined) { return; }
  if (typeof label !== 'string') {
    throw new QueryError('label must be a string', {
      code: 'E_QUERY_LABEL_TYPE',
      context: { receivedType: typeof label },
    });
  }
}

function normalizeDepth(depth: number | [number, number] | undefined): [number, number] {
  if (depth === undefined) { return [1, 1]; }
  if (typeof depth === 'number') {
    if (!Number.isInteger(depth) || depth < 0) {
      throw new QueryError('depth must be a non-negative integer', {
        code: 'E_QUERY_DEPTH_TYPE',
        context: { value: depth },
      });
    }
    return [depth, depth];
  }
  if (Array.isArray(depth) && depth.length === 2) {
    const [min, max] = depth;
    if (!Number.isInteger(min) || !Number.isInteger(max) || min < 0 || max < 0) {
      throw new QueryError('depth values must be non-negative integers', {
        code: 'E_QUERY_DEPTH_TYPE',
        context: { value: depth },
      });
    }
    if (min > max) {
      throw new QueryError('depth min must be <= max', {
        code: 'E_QUERY_DEPTH_RANGE',
        context: { min, max },
      });
    }
    return [min, max];
  }
  throw new QueryError('depth must be a number or [min, max] array', {
    code: 'E_QUERY_DEPTH_TYPE',
    context: { receivedType: typeof depth, value: depth },
  });
}

/**
 * Fluent query builder for materialized WARP state.
 *
 * Accumulates query state via chaining methods, then delegates
 * execution to QueryRunner via run().
 */
export default class QueryBuilder {
  private readonly _provider: QueryReadModelProvider;
  private _pattern: string | string[] | null;
  private readonly _operations: QueryOperation[];
  private _select: string[] | null;
  private _aggregate: AggregateSpec | null;

  constructor(provider: QueryReadModelProvider) {
    this._provider = provider;
    this._pattern = null;
    this._operations = [];
    this._select = null;
    this._aggregate = null;
  }

  toPlan(): QueryPlan {
    return new QueryPlan({
      pattern: this._pattern ?? DEFAULT_PATTERN,
      operations: this._operations,
      select: this._select,
      aggregate: this._aggregate,
    });
  }

  supportRule(): BoundedSupportRule {
    return BoundedSupportRule.fromQueryPlan(this.toPlan());
  }

  supportFragmentPlan(): SupportFragmentPlan {
    return SupportFragmentPlan.fromSupportRule(this.supportRule());
  }

  match(pattern: string | string[]): QueryBuilder {
    assertMatchPattern(pattern);
    this._pattern = pattern;
    return this;
  }

  where(fn: QueryWhereCandidate): QueryBuilder {
    const predicate = createPredicate(fn);
    this._operations.push({ type: 'where', fn: predicate });
    return this;
  }

  outgoing(label?: string, options?: { depth?: number | [number, number] }): QueryBuilder {
    if (this._aggregate) {
      throw new QueryError('outgoing() cannot be called after aggregate()', {
        code: 'E_QUERY_AGGREGATE_TERMINAL',
      });
    }
    assertLabel(label);
    const depth = normalizeDepth(options?.depth);
    this._operations.push({ type: 'outgoing', ...(label !== undefined ? { label } : {}), depth });
    return this;
  }

  incoming(label?: string, options?: { depth?: number | [number, number] }): QueryBuilder {
    if (this._aggregate) {
      throw new QueryError('incoming() cannot be called after aggregate()', {
        code: 'E_QUERY_AGGREGATE_TERMINAL',
      });
    }
    assertLabel(label);
    const depth = normalizeDepth(options?.depth);
    this._operations.push({ type: 'incoming', ...(label !== undefined ? { label } : {}), depth });
    return this;
  }

  select(fields?: string[]): QueryBuilder {
    if (this._aggregate) {
      throw new QueryError('select() cannot be called after aggregate()', {
        code: 'E_QUERY_AGGREGATE_TERMINAL',
      });
    }
    if (fields === undefined) {
      this._select = null;
      return this;
    }
    if (!Array.isArray(fields)) {
      throw new QueryError('select() expects an array of fields', {
        code: 'E_QUERY_SELECT_TYPE',
        context: { receivedType: typeof fields },
      });
    }
    this._select = fields;
    return this;
  }

  aggregate(spec: AggregateSpec): QueryBuilder {
    assertAggregateSpec(spec);
    for (const key of NUMERIC_AGGREGATE_KEYS) {
      const value = spec[key];
      if (value !== undefined && typeof value !== 'string') {
        throw new QueryError(`aggregate() expects ${key} to be a string path`, {
          code: 'E_QUERY_AGGREGATE_TYPE',
          context: { key, receivedType: typeof value },
        });
      }
    }
    if (spec.count !== undefined && typeof spec.count !== 'boolean') {
      throw new QueryError('aggregate() expects count to be boolean', {
        code: 'E_QUERY_AGGREGATE_TYPE',
        context: { key: 'count', receivedType: typeof spec.count },
      });
    }
    this._aggregate = spec;
    return this;
  }

  async run(): Promise<QueryResult | AggregateResult> {
    const runner = new QueryRunner(this._provider);
    return await runner.run(this.toPlan());
  }
}
