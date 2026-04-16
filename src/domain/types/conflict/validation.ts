/**
 * Shared validation utilities for conflict domain types.
 *
 * These helpers validate runtime invariants on values whose TypeScript
 * types are already known (the calling constructors accept typed fields).
 * They live at the boundary between TS typing and runtime truth: the
 * type system promises "string, number, boolean", but the runtime value
 * may still be empty, negative, or out of range.
 *
 * Every helper accepts the declared TS input type — no `unknown`. Cycle
 * 0025B3 removed the wide-net `value: unknown` signatures that used to
 * live here; validators that genuinely cross an untyped boundary live
 * inside type-guard predicates (`isFoo(value): value is Foo`) in the
 * modules that own the boundary.
 *
 * @module domain/types/conflict/validation
 */

import WarpError from '../../errors/WarpError.ts';
import type { HashablePayload } from './HashablePayload.ts';
import type { ConflictDiagnosticData } from './ConflictDiagnostic.ts';

/**
 * Validates that a string value is non-empty.
 */
export function requireNonEmptyString(value: string, name: string, context: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${context}: ${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}

/**
 * Validates that a numeric value is a non-negative integer.
 */
export function requireNonNegativeInt(value: number, name: string, context: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new WarpError(`${context}: ${name} must be a non-negative integer`, 'E_VALIDATION');
  }
  return value;
}

/**
 * Validates that a value is a boolean.
 */
export function requireBoolean(value: boolean, name: string, context: string): boolean {
  if (typeof value !== 'boolean') {
    throw new WarpError(`${context}: ${name} must be a boolean`, 'E_VALIDATION');
  }
  return value;
}

/**
 * Validates that a string value belongs to a fixed allowed set.
 */
export function requireEnum(value: string, allowed: Set<string>, { name, context }: { name: string; context: string }): string {
  if (!allowed.has(value)) {
    throw new WarpError(`${context}: ${name} must be one of ${[...allowed].join(', ')}`, 'E_VALIDATION');
  }
  return value;
}

/**
 * Validates an optional string — must be non-empty when present.
 */
export function optionalString(value: string | null | undefined, name: string, context: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireNonEmptyString(value, name, context);
}

/**
 * Validates an optional enum — must be in the allowed set when present.
 */
export function optionalEnum(value: string | null | undefined, allowed: Set<string>, label: { name: string; context: string }): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireEnum(value, allowed, label);
}

/**
 * Deep-freezes an optional diagnostic data payload. Returns undefined
 * when absent.
 */
export function freezeOptionalDiagnosticData(value: ConflictDiagnosticData | null | undefined): ConflictDiagnosticData | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const copy: { [key: string]: HashablePayload | undefined } = {};
  for (const key of Object.keys(value)) {
    const v = value[key];
    if (v !== undefined) {
      copy[key] = v;
    }
  }
  return Object.freeze(copy);
}

/**
 * Freezes an array of strings, returning an empty frozen array when absent.
 */
export function freezeStringArray(value: readonly string[] | null | undefined): readonly string[] {
  if (value === null || value === undefined) {
    return Object.freeze<readonly string[]>([]);
  }
  return Object.freeze([...value]);
}

/**
 * Lexicographic string comparison for sorting.
 */
export function compareStrings(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}
