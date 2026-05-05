/**
 * OpValidator — validates raw/canonical op shapes at reducer boundaries.
 *
 * Two responsibilities:
 *
 * 1. **Type recognition** — `RAW_KNOWN_OPS` / `CANONICAL_KNOWN_OPS`
 *    and their `isKnownRaw` / `isKnownCanonical` guards. Used at the
 *    sync/wire boundary to fail-close on unknown op types. // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
 *
 * 2. **Field assertion** — `assertString` / `assertIterable` /
 *    `assertDot` raise `PatchError` with structured context when a
 *    field violates its expected shape. Called from each
 *    `OpStrategy.validate()` method.
 *
 * The class exposes only static methods — there is no instance state to
 * freeze, and the `unknown` inputs on `isKnownRaw` / `isKnownCanonical` // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
 * are intentional parser-boundary types rather than leaked ambiguity.
 *
 * @module domain/services/OpValidator
 */

import { Dot } from '../crdt/Dot.ts';
import PatchError from '../errors/PatchError.ts';

/** A minimal tagged op shape accepted by the validator entrypoints. */
type TaggedOp = { readonly type: string };

/**
 * Reads an arbitrary field from a tagged op without requiring callers
 * to provide an index-signature type.
 */
function readField(op: TaggedOp, field: string): unknown { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  return Reflect.get(op, field);
}

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
   * Use this at sync/decode boundaries to reject unknown or // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
   * canonical-only types arriving from the wire.
   */
  static isKnownRaw(op: unknown): boolean { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
    if (op === null || op === undefined || typeof op !== 'object') {
      return false;
    }
    if (!('type' in op)) {
      return false;
    }
    const { type } = op;
    return typeof type === 'string' && OpValidator.RAW_KNOWN_OPS.has(type);
  }

  /**
   * Returns true iff the op has a known CANONICAL (internal) type.
   * Use this for internal guards after normalization.
   */
  static isKnownCanonical(op: unknown): boolean { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
    if (op === null || op === undefined || typeof op !== 'object') {
      return false;
    }
    if (!('type' in op)) {
      return false;
    }
    const { type } = op;
    return typeof type === 'string' && OpValidator.CANONICAL_KNOWN_OPS.has(type);
  }

  /** Asserts that `op[field]` is a string. */
  static assertString(op: TaggedOp, field: string): void {
    const value = readField(op, field);
    if (typeof value !== 'string') {
      throw new PatchError(
        `${op.type} op requires '${field}' to be a string, got ${typeof value}`,
        { context: { opType: op.type, field, actual: typeof value } },
      );
    }
  }

  /**
   * Asserts that `op[field]` is iterable (Array, Set, or anything
   * providing `Symbol.iterator`).
   */
  static assertIterable(op: TaggedOp, field: string): void {
    const val = readField(op, field);
    if (
      val === null ||
      val === undefined ||
      typeof val !== 'object' ||
      typeof Reflect.get(val, Symbol.iterator) !== 'function'
    ) {
      throw new PatchError(
        `${op.type} op requires '${field}' to be iterable, got ${typeof val}`,
        { context: { opType: op.type, field, actual: typeof val } },
      );
    }
  }

  /**
   * Asserts that `op.dot` is a real `Dot` instance.
   * Reducer entrypoints hydrate raw decoded POJOs before strategy validation.
   */
  static assertDot(op: TaggedOp): void {
    const dot = readField(op, 'dot');
    if (!(dot instanceof Dot)) {
      throw new PatchError(
        `${op.type} op requires 'dot' to be a Dot instance`,
        { context: { opType: op.type, field: 'dot', actual: typeof dot } },
      );
    }
  }
}
