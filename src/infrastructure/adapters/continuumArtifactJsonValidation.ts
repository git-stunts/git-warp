import ContinuumArtifactAuthority from '../../domain/continuum/ContinuumArtifactAuthority.ts';
import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';
import type { ContinuumArtifactJsonLoadContext } from './ContinuumArtifactJsonLoadContext.ts';
import type { JsonObject } from './JsonObject.ts';

const LOAD_CONTEXT_KEYS = Object.freeze([
  'familyId',
  'authority',
  'sourceSchemaPath',
  'generatedBy',
  'version',
  'targets',
  'witnessScope',
  'artifactDigest',
]);

/** Validates the caller-supplied load context boundary. */
export function validateLoadContext(context: ContinuumArtifactJsonLoadContext): void {
  rejectUnknownKeys(
    requireJsonObject(context, 'Continuum artifact load context'),
    LOAD_CONTEXT_KEYS,
    'Continuum artifact load context',
  );
}

/** Requires the context authority that matches the parsed artifact shape. */
export function requireContextAuthority(
  context: ContinuumArtifactJsonLoadContext,
  expected: string,
  label: string,
): void {
  const actual = readContextAuthority(context.authority);
  if (actual !== expected) {
    throw new AdapterValidationError(`${label} load context authority must be ${expected}`);
  }
}

/** Requires a non-array JSON object. */
export function requireJsonObject(value: unknown, label: string): JsonObject {
  if (!isJsonObject(value)) {
    throw new AdapterValidationError(`${label} must be an object`);
  }
  return value;
}

/** Returns true when a value is a non-array JSON object. */
export function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Rejects unexpected fields at a parsed JSON boundary. */
export function rejectUnknownKeys(source: JsonObject, allowed: readonly string[], label: string): void {
  for (const key of Object.keys(source)) {
    if (!allowed.includes(key)) {
      throw new AdapterValidationError(`${label} field "${key}" is not allowed`);
    }
  }
}

/** Reads a required string field. */
export function readRequiredString(source: JsonObject, key: string): string {
  const value = source[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new AdapterValidationError(`Continuum artifact descriptor field "${key}" must be a non-empty string`);
  }
  return value;
}

/** Reads a required context string. */
export function readContextString(value: string | undefined, key: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AdapterValidationError(`Continuum artifact load context field "${key}" must be a non-empty string`);
  }
  return value;
}

/** Reads a required number field. */
export function readRequiredNumber(source: JsonObject, key: string): number {
  const value = source[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AdapterValidationError(`Continuum artifact descriptor field "${key}" must be a finite number`);
  }
  return value;
}

/** Reads an optional generated artifact count. */
export function readOptionalArtifactCount(source: JsonObject, key: string): number | undefined {
  const count = readOptionalNumber(source, key);
  if (count === undefined) {
    return undefined;
  }
  if (!Number.isInteger(count) || count < 0) {
    throw new AdapterValidationError(`Continuum artifact descriptor field "${key}" must be a non-negative integer`);
  }
  return count;
}

/** Reads an optional string array field. */
export function readOptionalStringArray(source: JsonObject, key: string): readonly string[] | undefined {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }
  return readStringArray(source, key);
}

/** Reads an optional string field. */
export function readOptionalString(source: JsonObject, key: string): string | undefined {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }
  return readRequiredString(source, key);
}

/** Reads a required string array field. */
export function readStringArray(source: JsonObject, key: string): readonly string[] {
  const value = source[key];
  if (!Array.isArray(value)) {
    throw new AdapterValidationError(`Continuum artifact descriptor field "${key}" must be a string array`);
  }
  const strings: string[] = [];
  for (const entry of value) {
    strings.push(readStringArrayEntry(entry, key));
  }
  return Object.freeze(strings);
}

/** Reads an optional number field. */
function readOptionalNumber(source: JsonObject, key: string): number | undefined {
  const value = source[key];
  if (value === undefined) {
    return undefined;
  }
  return readRequiredNumber(source, key);
}

/** Reads a context authority carrier as a string. */
function readContextAuthority(value: string | ContinuumArtifactAuthority): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof ContinuumArtifactAuthority) {
    return value.toString();
  }
  throw new AdapterValidationError('Continuum artifact load context field "authority" must be an authority carrier');
}

/** Reads one string array entry. */
function readStringArrayEntry(value: unknown, key: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new AdapterValidationError(
      `Continuum artifact descriptor field "${key}" must contain only non-empty strings`,
    );
  }
  return value;
}
