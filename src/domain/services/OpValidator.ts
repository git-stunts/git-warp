/**
 * OpValidator — validates raw/canonical op shapes at reducer boundaries.
 *
 * Two responsibilities:
 *
 * 1. **Type recognition** — `RAW_KNOWN_OPS` / `CANONICAL_KNOWN_OPS`
 *    and their `isKnownRaw` / `isKnownCanonical` guards. Used at the
 *    sync/wire boundary to fail-close on unknown op types.
 *
 * 2. **Field assertion** — `assertString` / `assertIterable` /
 *    `assertDot` raise `PatchError` with structured context when a
 *    field violates its expected shape. Called from each
 *    `OpStrategy.validate()` method.
 *
 * The class exposes only static methods — there is no instance state to
 * freeze, and the `unknown` inputs on `isKnownRaw` / `isKnownCanonical`
 * are intentional parser-boundary types rather than leaked ambiguity.
 *
 * @module domain/services/OpValidator
 */

import PatchError from '../errors/PatchError.ts';

/** A minimal shape used inside the validator for field-assertion errors. */
type TaggedFields = { readonly type: string; readonly [key: string]: unknown };

export default class OpValidator {
  /**
   * Known raw (wire-format) op types. These are the 6 types that
   * appear in persisted patches and on the sync wire.
   */
  static readonly RAW_KNOWN_OPS: ReadonlySet<string> = new Set([
    'NodeAdd', 'NodeRemove', 'EdgeAdd', 'EdgeRemove',
    'PropSet', 'BlobValue',
  ]);

  /**
   * Known canonical (internal) op types. Includes the 6 raw types
   * plus the ADR-1 canonical split types `NodePropSet` and `EdgePropSet`.
   */
  static readonly CANONICAL_KNOWN_OPS: ReadonlySet<string> = new Set([
    'NodeAdd', 'NodeRemove', 'EdgeAdd', 'EdgeRemove',
    'PropSet', 'NodePropSet', 'EdgePropSet', 'BlobValue',
  ]);

  /**
   * Returns true iff the op has a known RAW (wire-format) type.
   * Use this at sync/decode boundaries to reject unknown or
   * canonical-only types arriving from the wire.
   */
  static isKnownRaw(op: unknown): boolean {
    if (op === null || op === undefined || typeof op !== 'object') {
      return false;
    }
    const typed = op as { readonly type?: unknown };
    return typeof typed.type === 'string' && OpValidator.RAW_KNOWN_OPS.has(typed.type);
  }

  /**
   * Returns true iff the op has a known CANONICAL (internal) type.
   * Use this for internal guards after normalization.
   */
  static isKnownCanonical(op: unknown): boolean {
    if (op === null || op === undefined || typeof op !== 'object') {
      return false;
    }
    const typed = op as { readonly type?: unknown };
    return typeof typed.type === 'string' && OpValidator.CANONICAL_KNOWN_OPS.has(typed.type);
  }

  /** Asserts that `op[field]` is a string. */
  static assertString(op: TaggedFields, field: string): void {
    if (typeof op[field] !== 'string') {
      throw new PatchError(
        `${op.type} op requires '${field}' to be a string, got ${typeof op[field]}`,
        { context: { opType: op.type, field, actual: typeof op[field] } },
      );
    }
  }

  /**
   * Asserts that `op[field]` is iterable (Array, Set, or anything
   * providing `Symbol.iterator`).
   */
  static assertIterable(op: TaggedFields, field: string): void {
    const val = op[field];
    if (
      val === null ||
      val === undefined ||
      typeof val !== 'object' ||
      typeof (val as { [Symbol.iterator]?: unknown })[Symbol.iterator] !== 'function'
    ) {
      throw new PatchError(
        `${op.type} op requires '${field}' to be iterable, got ${typeof val}`,
        { context: { opType: op.type, field, actual: typeof val } },
      );
    }
  }

  /**
   * Asserts that `op.dot` is an object with `writerId: string` and
   * `counter: number`. (Does not require a full `Dot` class instance —
   * the reducer still accepts POJOs for backward compatibility with
   * decoded wire patches.)
   */
  static assertDot(op: TaggedFields): void {
    const { dot } = op;
    if (dot === null || dot === undefined || typeof dot !== 'object') {
      throw new PatchError(
        `${op.type} op requires 'dot' to be an object, got ${typeof dot}`,
        { context: { opType: op.type, field: 'dot', actual: typeof dot } },
      );
    }
    const d = dot as { readonly writerId?: unknown; readonly counter?: unknown };
    if (typeof d.writerId !== 'string') {
      throw new PatchError(
        `${op.type} op requires 'dot.writerId' to be a string, got ${typeof d.writerId}`,
        { context: { opType: op.type, field: 'dot.writerId', actual: typeof d.writerId } },
      );
    }
    if (typeof d.counter !== 'number') {
      throw new PatchError(
        `${op.type} op requires 'dot.counter' to be a number, got ${typeof d.counter}`,
        { context: { opType: op.type, field: 'dot.counter', actual: typeof d.counter } },
      );
    }
  }
}
