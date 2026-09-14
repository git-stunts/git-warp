import type {
  McpJsonObject,
  McpJsonValue,
} from '../cli/commands/mcp/McpJsonValue.ts';
import WarpError from '../../src/domain/errors/WarpError.ts';

export function toMcpJson(value: object): McpJsonValue {
  return parseMcpJson(value);
}

export function parseMcpJson(value: unknown): McpJsonValue {
  if (isJsonScalar(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map(parseMcpJson));
  }
  if (isPlainObject(value)) {
    const record: McpJsonObject = {};
    for (const [key, entry] of Object.entries(value)) {
      defineMcpJsonProperty(record, key, parseMcpJson(entry));
    }
    return Object.freeze(record);
  }
  throw new WarpError(
    'Value is not canonical JSON data',
    'E_V19_JSON_VALUE',
  );
}

/** Defines caller-controlled JSON keys without invoking Object prototype setters. */
export function defineMcpJsonProperty(
  record: McpJsonObject,
  key: string,
  value: McpJsonValue,
): void {
  Object.defineProperty(record, key, {
    configurable: false,
    enumerable: true,
    value,
    writable: false,
  });
}

function isJsonScalar(
  value: unknown,
): value is null | boolean | number | string {
  return value === null
    || typeof value === 'boolean'
    || typeof value === 'string'
    || (typeof value === 'number' && Number.isFinite(value));
}

function isPlainObject(
  value: unknown,
): value is { readonly [key: string]: unknown } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}
