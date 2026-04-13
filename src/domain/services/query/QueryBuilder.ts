/**
 * QueryBuilder — fluent query accumulator for materialized WARP state.
 *
 * Pure accumulator: builder methods accumulate query state into a
 * QueryPlan, then run() delegates execution to QueryRunner.
 */

import QueryError from '../../errors/QueryError.ts';
import QueryPlan, { type AggregateSpec, type QueryNodeSnapshot, type QueryOperation } from './QueryPlan.ts';
import QueryRunner, { type QueryGraph, type QueryResult, type AggregateResult } from './QueryRunner.ts';

const DEFAULT_PATTERN = '*';

function assertMatchPattern(pattern: unknown): void {
  const isString = typeof pattern === 'string';
  const isStringArray = Array.isArray(pattern) && pattern.every((p) => typeof p === 'string');
  if (!isString && !isStringArray) {
    throw new QueryError('match() expects a string pattern or array of string patterns', {
      code: 'E_QUERY_MATCH_TYPE',
      context: { receivedType: typeof pattern },
    });
  }
}

function assertPredicate(fn: unknown): void {
  if (typeof fn !== 'function' && !isPlainObject(fn)) {
    throw new QueryError('where() expects a predicate function or object', {
      code: 'E_QUERY_WHERE_TYPE',
      context: { receivedType: typeof fn },
    });
  }
}

function isPlainObject(value: unknown): boolean {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPrimitive(value: unknown): boolean {
  return value === null || (typeof value !== 'object' && typeof value !== 'function');
}

function objectToPredicate(obj: Record<string, unknown>): (node: QueryNodeSnapshot) => boolean {
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

function assertLabel(label: unknown): void {
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
  private readonly _graph: QueryGraph;
  private _pattern: string | string[] | null;
  private readonly _operations: QueryOperation[];
  private _select: string[] | null;
  private _aggregate: AggregateSpec | null;

  constructor(graph: QueryGraph) {
    this._graph = graph;
    this._pattern = null;
    this._operations = [];
    this._select = null;
    this._aggregate = null;
  }

  match(pattern: string | string[]): QueryBuilder {
    assertMatchPattern(pattern);
    this._pattern = pattern;
    return this;
  }

  where(fn: ((node: QueryNodeSnapshot) => boolean) | Record<string, unknown>): QueryBuilder {
    assertPredicate(fn);
    const predicate = isPlainObject(fn)
      ? objectToPredicate(fn as Record<string, unknown>)
      : fn as (node: QueryNodeSnapshot) => boolean;
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
    if (!isPlainObject(spec)) {
      throw new QueryError('aggregate() expects an object', {
        code: 'E_QUERY_AGGREGATE_TYPE',
        context: { receivedType: typeof spec },
      });
    }
    const numericKeys = ['sum', 'avg', 'min', 'max'] as const;
    const specAny = spec as Record<string, unknown>;
    for (const key of numericKeys) {
      if (specAny[key] !== undefined && typeof specAny[key] !== 'string') {
        throw new QueryError(`aggregate() expects ${key} to be a string path`, {
          code: 'E_QUERY_AGGREGATE_TYPE',
          context: { key, receivedType: typeof specAny[key] },
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
    const plan = new QueryPlan({
      pattern: this._pattern ?? DEFAULT_PATTERN,
      operations: this._operations,
      select: this._select,
      aggregate: this._aggregate,
    });
    const runner = new QueryRunner(this._graph);
    return await runner.run(plan);
  }
}
