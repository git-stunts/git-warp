import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/**
 * Error class for query builder and graph query operations.
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_NO_STATE` | No live reading basis is available for the requested read |
 * | `E_STALE_STATE` | The live reading basis is stale for the requested read |
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
 */
export default class QueryError extends WarpError {
  constructor(message: string, options: WarpErrorOptions = {}) {
    super(message, 'QUERY_ERROR', options);
  }
}
