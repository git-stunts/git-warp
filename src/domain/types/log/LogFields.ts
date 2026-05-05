/**
 * LogFields — a record of named diagnostic values passed to a
 * `LoggerPort` method or used as a child-logger base context.
 *
 * This is the typed replacement for the pre-0025B1 open-shape
 * surface. A `LogFields` map is sparse: keys map to a bounded union
 * (`LogFieldValue`) rather than to an any-shaped value. That
 * forbids dumping decoded-reality into the log stream without a
 * named field type.
 *
 * Why a `type` and not a `class`: no invariants, no identity, no
 * behavior. A `LogFields` value is pure data; the logger adapter
 * decides how it becomes bytes on the wire. SSTS P1 reserves
 * runtime-backed class forms for concepts with invariants.
 *
 * @module domain/types/log/LogFields
 */

import type LogFieldValue from './LogFieldValue.ts';

/**
 * A readonly map from field name to `LogFieldValue`. Nested
 * structure is expressed through `LogFieldValue` itself.
 */
export type LogFields = { readonly [key: string]: LogFieldValue };

export default LogFields;
