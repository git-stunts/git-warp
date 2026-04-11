/**
 * QueryBuilder — fluent query accumulator for materialized WARP state.
 *
 * Pure accumulator: builder methods accumulate query state into a
 * QueryPlan, then run() delegates execution to QueryRunner.
 */

import QueryError from '../../errors/QueryError.ts';
import QueryPlan from './QueryPlan.ts';
import QueryRunner from './QueryRunner.ts';

const DEFAULT_PATTERN = '*';

// ── Validation helpers ──────────────────────────────────────────────

/**
 * Asserts that a match pattern is a string or array of strings.
 * @param {unknown} pattern
 * @private
 */
function assertMatchPattern(pattern) {
  const isString = typeof pattern === 'string';
  const isStringArray = Array.isArray(pattern) && pattern.every((p) => typeof p === 'string');

  if (!isString && !isStringArray) {
    throw new QueryError('match() expects a string pattern or array of string patterns', {
      code: 'E_QUERY_MATCH_TYPE',
      context: { receivedType: typeof pattern },
    });
  }
}

/**
 * Asserts that a predicate is a function or plain object.
 * @param {unknown} fn
 * @private
 */
function assertPredicate(fn) {
  if (typeof fn !== 'function' && !isPlainObject(fn)) {
    throw new QueryError('where() expects a predicate function or object', {
      code: 'E_QUERY_WHERE_TYPE',
      context: { receivedType: typeof fn },
    });
  }
}

/**
 * Checks whether a value is a plain object.
 * @param {unknown} value
 * @returns {boolean}
 * @private
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Checks whether a value is a primitive.
 * @param {unknown} value
 * @returns {boolean}
 * @private
 */
function isPrimitive(value) {
  return value === null || (typeof value !== 'object' && typeof value !== 'function');
}

/**
 * Converts a plain object to a where() predicate function.
 * @param {Record<string, unknown>} obj
 * @returns {(node: import('./QueryPlan.ts').QueryNodeSnapshot) => boolean}
 * @private
 */
function objectToPredicate(obj) {
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
      if (!(key in props) || props[key] !== value) {
        return false;
      }
    }
    return true;
  };
}

/**
 * Asserts that a label is undefined or a string.
 * @param {unknown} label
 * @private
 */
function assertLabel(label) {
  if (label === undefined) {
    return;
  }
  if (typeof label !== 'string') {
    throw new QueryError('label must be a string', {
      code: 'E_QUERY_LABEL_TYPE',
      context: { receivedType: typeof label },
    });
  }
}

/**
 * Normalizes a depth specification into a [min, max] tuple.
 * @param {number | [number, number] | undefined} depth
 * @returns {[number, number]}
 * @private
 */
function normalizeDepth(depth) {
  if (depth === undefined) {
    return [1, 1];
  }
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

// ── Builder ─────────────────────────────────────────────────────────

/**
 * @typedef {import('./QueryRunner.ts').QueryGraph} QueryGraph
 */

/**
 * Fluent query builder for materialized WARP state.
 *
 * Accumulates query state via chaining methods, then delegates
 * execution to QueryRunner via run().
 */
export default class QueryBuilder {
  /**
   * Creates a new QueryBuilder.
   * @param {QueryGraph} graph
   */
  constructor(graph) {
    this._graph = graph;
    /** @type {string|string[]|null} */
    this._pattern = null;
    /** @type {Array<import('./QueryPlan.ts').QueryOperation>} */
    this._operations = [];
    /** @type {string[]|null} */
    this._select = null;
    /** @type {import('./QueryPlan.ts').AggregateSpec|null} */
    this._aggregate = null;
  }

  /**
   * Sets the match pattern for node ID filtering.
   * @param {string|string[]} pattern
   * @returns {QueryBuilder}
   */
  match(pattern) {
    assertMatchPattern(pattern);
    /** @type {string|string[]|null} */
    this._pattern = pattern;
    return this;
  }

  /**
   * Filters nodes by predicate function or object shorthand.
   * @param {((node: import('./QueryPlan.ts').QueryNodeSnapshot) => boolean) | Record<string, unknown>} fn
   * @returns {QueryBuilder}
   */
  where(fn) {
    assertPredicate(fn);
    const predicate = isPlainObject(fn) ? objectToPredicate(/** @type {Record<string, unknown>} */ (fn)) : /** @type {(node: import('./QueryPlan.ts').QueryNodeSnapshot) => boolean} */ (fn);
    this._operations.push({ type: 'where', fn: predicate });
    return this;
  }

  /**
   * Traverses outgoing edges from the current strand.
   * @param {string} [label]
   * @param {{ depth?: number | [number, number] }} [options]
   * @returns {QueryBuilder}
   */
  outgoing(label, options) {
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

  /**
   * Traverses incoming edges to the current strand.
   * @param {string} [label]
   * @param {{ depth?: number | [number, number] }} [options]
   * @returns {QueryBuilder}
   */
  incoming(label, options) {
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

  /**
   * Selects which fields to include in the result nodes.
   * @param {string[]} [fields]
   * @returns {QueryBuilder}
   */
  select(fields) {
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

  /**
   * Computes aggregations over the matched nodes.
   * @param {import('./QueryPlan.ts').AggregateSpec} spec
   * @returns {QueryBuilder}
   */
  aggregate(spec) {
    if (!isPlainObject(spec)) {
      throw new QueryError('aggregate() expects an object', {
        code: 'E_QUERY_AGGREGATE_TYPE',
        context: { receivedType: typeof spec },
      });
    }
    const numericKeys = ['sum', 'avg', 'min', 'max'];
    const specAny = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (spec));
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

  /**
   * Executes the query by building a QueryPlan and delegating to QueryRunner.
   *
   * @returns {Promise<import('./QueryRunner.ts').QueryResult | import('./QueryRunner.ts').AggregateResult>}
   */
  async run() {
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
