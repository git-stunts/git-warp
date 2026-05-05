/**
 * LogFieldValue — the union of values a log-field structure may
 * carry.
 *
 * Logging is the easiest place for sludge to hide. If the context
 * parameter accepts an any-shaped record, every caller gets to dump
 * anything it wants into the log stream, and downstream formatting
 * becomes a JSON.stringify-and-pray. `LogFieldValue` names the
 * concrete set of things a field may hold, so the type system
 * rejects unnamed values.
 *
 * ### What is allowed
 *
 * - JSON-native primitives (`string`, `number`, `boolean`, `null`).
 * - `undefined` — `LogFields` is sparse; explicit `undefined` values
 *   let callers signal "this field exists but has no value" without
 *   reaching for a sentinel.
 * - `bigint` — structured-log backends generally serialize bigints
 *   (Node's `util.inspect` does so natively). Included because
 *   numeric identifiers in this codebase often flow as bigints.
 * - `Uint8Array` — some diagnostic contexts carry short binary
 *   slices (hashes, keys). The logging backend serializes them
 *   adapter-side (hex, base64, or the raw length).
 * - `Error` — caller passes the error object directly; the adapter
 *   decides how to serialize `name`, `message`, and `stack`.
 * - `Date` — timestamps in diagnostic context. The adapter decides
 *   the ISO-string form.
 * - `ReadonlyArray<LogFieldValue>` — recursive arrays.
 * - `LogFields` (nested records) — structured context nests.
 *
 * ### What is not allowed
 *
 * - Bare `object` — a shrug type.
 * - `Function` — log what happened, not how.
 * - `symbol` — not serializable by structured-log backends.
 *
 * Transport DTO: no invariants, no behavior, no identity. `type`,
 * not `class`, per SSTS P1.
 *
 * @module domain/types/log/LogFieldValue
 */

import type LogFields from './LogFields.ts';

/**
 * A value admissible as a `LogFields[key]`. Recursive via
 * `LogFields` and `ReadonlyArray<LogFieldValue>`.
 */
export type LogFieldValue =
  | string
  | number
  | boolean
  | null
  | undefined
  | bigint
  | Uint8Array
  | Error
  | Date
  | ReadonlyArray<LogFieldValue>
  | LogFields;

export default LogFieldValue;
