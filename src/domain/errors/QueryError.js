/**
 * Error class for query builder and graph query operations.
 *
 * QueryError is thrown when a query operation fails due to invalid input,
 * missing state, or constraint violations. It provides structured error
 * information via error codes and context objects for programmatic handling.
 *
 * ## When This Error Is Thrown
 *
 * - **Invalid query syntax**: Passing wrong types to query methods (e.g., non-string to `match()`)
 * - **Missing state**: Calling query methods before `materialize()` has been called
 * - **Stale state**: Querying when the cached state is outdated and needs refresh
 * - **Invalid traversal options**: Using incorrect depth ranges or field selectors
 * - **Constraint violations**: Calling methods in invalid order (e.g., `outgoing()` after `aggregate()`)
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_NO_STATE` | No cached state available; call `materialize()` first |
 * | `E_STALE_STATE` | Cached state is outdated; call `materialize()` to refresh |
 * | `E_QUERY_MATCH_TYPE` | Invalid type passed to `match()` (expected string) |
 * | `E_QUERY_WHERE_TYPE` | Invalid type passed to `where()` (expected function or object) |
 * | `E_QUERY_WHERE_VALUE` | Non-primitive value in where() object shorthand |
 * | `E_QUERY_LABEL_TYPE` | Invalid type for edge label (expected string) |
 * | `E_QUERY_DEPTH_TYPE` | Invalid depth value (expected non-negative integer or [min, max] array) |
 * | `E_QUERY_DEPTH_RANGE` | Invalid depth range (min > max) |
 * | `E_QUERY_SELECT_TYPE` | Invalid type passed to `select()` (expected array) |
 * | `E_QUERY_SELECT_FIELD` | Unknown field name in select() |
 * | `E_QUERY_AGGREGATE_TYPE` | Invalid type passed to `aggregate()` |
 * | `E_QUERY_AGGREGATE_TERMINAL` | Method called after aggregate() which is terminal |
 * | `QUERY_ERROR` | Generic/default query error |
 *
 * ## Context Structure
 *
 * The context object varies by error code but commonly includes:
 * - `receivedType`: The actual type received when a type error occurs
 * - `value`: The invalid value that caused the error
 * - `field`: The specific field name that was invalid
 * - `key`: The property key involved in the error
 * - `min`, `max`: Range bounds for depth errors
 *
 * @class QueryError
 * @extends Error
 *
 * @property {string} name - Always 'QueryError' for instanceof checks
 * @property {string} code - Machine-readable error code for programmatic handling
 * @property {Object} context - Serializable context object with error details
 *
 * @example
 * // Handling missing state error
 * try {
 *   graph.query().match('user:*').run();
 * } catch (err) {
 *   if (err instanceof QueryError && err.code === 'E_NO_STATE') {
 *     await graph.materialize();
 *     // Retry query
 *   }
 * }
 *
 * @example
 * // Handling type validation errors
 * try {
 *   graph.query().match(123); // Wrong type
 * } catch (err) {
 *   console.error(err.code); // 'E_QUERY_MATCH_TYPE'
 *   console.error(err.context); // { receivedType: 'number' }
 * }
 *
 * @example
 * // Error thrown internally by QueryBuilder
 * throw new QueryError('match() expects a string pattern', {
 *   code: 'E_QUERY_MATCH_TYPE',
 *   context: { receivedType: typeof pattern },
 * });
 */
export default class QueryError extends Error {
  /**
   * Creates a new QueryError.
   *
   * @param {string} message - Human-readable error message describing what went wrong
   * @param {Object} [options={}] - Error options
   * @param {string} [options.code='QUERY_ERROR'] - Machine-readable error code.
   *   Should be one of the documented error codes (e.g., 'E_NO_STATE', 'E_QUERY_MATCH_TYPE').
   *   Falls back to 'QUERY_ERROR' if not provided.
   * @param {Object} [options.context={}] - Serializable context object containing
   *   additional debugging information. Should only contain JSON-serializable values.
   *
   * @example
   * throw new QueryError('No cached state. Call materialize() first.', {
   *   code: 'E_NO_STATE',
   * });
   *
   * @example
   * throw new QueryError('match() expects a string pattern', {
   *   code: 'E_QUERY_MATCH_TYPE',
   *   context: { receivedType: 'number' },
   * });
   */
  constructor(message, options = {}) {
    super(message);
    this.name = 'QueryError';
    this.code = options.code || 'QUERY_ERROR';
    this.context = options.context || {};
    Error.captureStackTrace?.(this, this.constructor);
  }
}
