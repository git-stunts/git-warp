/**
 * Shared validation utilities for conflict domain types.
 *
 * @module domain/types/conflict/validation
 */

/**
 * Validates that a value is a non-empty string.
 */
export function requireNonEmptyString(value: unknown, name: string, context: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${context}: ${name} must be a non-empty string`);
  }
  return value;
}

/**
 * Validates that a value is a non-negative integer.
 */
export function requireNonNegativeInt(value: unknown, name: string, context: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new TypeError(`${context}: ${name} must be a non-negative integer`);
  }
  return value as number;
}

/**
 * Validates that a value is a boolean.
 */
export function requireBoolean(value: unknown, name: string, context: string): boolean {
  if (typeof value !== 'boolean') {
    throw new TypeError(`${context}: ${name} must be a boolean`);
  }
  return value;
}

/**
 * Validates that a value belongs to a fixed set of allowed strings.
 */
export function requireEnum(value: unknown, allowed: Set<string>, { name, context }: { name: string; context: string }): string {
  if (!allowed.has(value as string)) {
    throw new TypeError(`${context}: ${name} must be one of ${[...allowed].join(', ')}`);
  }
  return value as string;
}

/**
 * Validates an optional string — must be non-empty when present.
 */
export function optionalString(value: unknown, name: string, context: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireNonEmptyString(value, name, context);
}

/**
 * Validates an optional enum — must be in the allowed set when present.
 */
export function optionalEnum(value: unknown, allowed: Set<string>, label: { name: string; context: string }): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return requireEnum(value, allowed, label);
}

/**
 * Deep-freezes an optional plain object. Returns undefined when absent.
 */
export function freezeOptionalObject(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  return Object.freeze({ ...(value as Record<string, unknown>) });
}

/**
 * Freezes an array of strings, returning an empty frozen array when absent.
 */
export function freezeStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return Object.freeze([]);
  }
  return Object.freeze((value as string[]).slice());
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
