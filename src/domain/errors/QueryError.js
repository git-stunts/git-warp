import WarpError from './WarpError.js';

/**
 * Error class for query builder and graph query operations.
 *
 * QueryError is thrown when a query operation fails due to invalid input,
 * missing state, or constraint violations. It provides structured error
 * information via error codes and context objects for programmatic handling.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_NO_STATE` | No materialized state available; call `materialize()` or use `autoMaterialize: true` |
 * | `E_STALE_STATE` | State is stale; call `materialize()` to refresh |
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
 * @class QueryError
 * @extends WarpError
 *
 * @property {string} name - Always 'QueryError' for instanceof checks
 * @property {string} code - Machine-readable error code for programmatic handling
 * @property {Object} context - Serializable context object with error details
 */
export default class QueryError extends WarpError {
  /**
   * @param {string} message
   * @param {{ code?: string, context?: Object }} [options={}]
   */
  constructor(message, options = {}) {
    super(message, 'QUERY_ERROR', options);
  }
}
