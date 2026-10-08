import CliFailureCode from './CliFailureCode.ts';
import { CLI_FAILURE_MAX_DEPTH, CLI_FAILURE_MAX_NODES } from './CliFailureLimits.ts';

/** Reads own data slots without invoking accessors or coercing raw values. */
export function ownData(value: object, key: string): unknown {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    const result: unknown = descriptor?.value;
    return result;
  } catch { return undefined; }
}

export function isError(value: unknown): value is Error {
  try { return value instanceof Error; }
  catch { return false; }
}

export function isAggregate(value: unknown): value is AggregateError {
  try { return value instanceof AggregateError; }
  catch { return false; }
}

export function displayCode(value: Error): string {
  const code = ownData(value, 'code');
  return typeof code === 'string' && CliFailureCode.accepts(code)
    ? code : 'E_INTERNAL';
}

export function validExit(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= 255;
}

/** Aggregate order preserves the operation before its cleanup failures. */
export function primaryIdentity(value: unknown): unknown {
  const seen = new Set<object>();
  let result = value;
  for (let depth = 0; depth < CLI_FAILURE_MAX_DEPTH; depth++) {
    if (!isAggregate(result)) { break; }
    if (seen.has(result)) { break; }
    seen.add(result);
    const first = aggregateMembers(result)[0];
    if (first === undefined) { break; }
    result = first;
  }
  return result;
}


/** Reads a finite own-index prefix; no caller-provided iterator is invoked. */
export function aggregateMembers(value: unknown): readonly unknown[] {
  if (!isAggregate(value)) { return []; }
  return boundedEntries(ownData(value, 'errors'));
}

export function boundedEntries(value: unknown): readonly unknown[] {
  if (!dataObject(value)) { return []; }
  const length = safeLength(value);
  if (length === 0) { return []; }
  const result: unknown[] = [];
  for (let index = 0; index < Math.min(length, CLI_FAILURE_MAX_NODES); index++) {
    result.push(ownData(value, String(index)));
  }
  return result;
}

export function safeLength(value: unknown): number {
  if (!dataObject(value)) { return 0; }
  const length = ownData(value, 'length');
  return typeof length === 'number' && Number.isSafeInteger(length) && length >= 0 ? length : 0;
}

function dataObject(value: unknown): value is object {
  return value !== null && typeof value === 'object';
}

/** Collects secondary members at every aggregate layer around the primary. */
export function secondaryMembers(value: unknown): readonly unknown[] {
  const result: unknown[] = [];
  const seen = new Set<object>();
  let current = value;
  for (let depth = 0; depth < CLI_FAILURE_MAX_DEPTH; depth++) {
    if (!isAggregate(current)) { break; }
    if (seen.has(current)) { break; }
    seen.add(current);
    const members = aggregateMembers(current);
    result.push(...members.slice(1, CLI_FAILURE_MAX_NODES - result.length + 1));
    current = members[0];
  }
  return result;
}

/** A bounded member prefix must explicitly disclose omitted wide siblings. */
export function aggregateOverflow(value: unknown): boolean {
  const seen = new Set<object>();
  let current = value;
  for (let depth = 0; depth < CLI_FAILURE_MAX_DEPTH; depth++) {
    if (!isAggregate(current)) { break; }
    if (seen.has(current)) { break; }
    seen.add(current);
    if (safeLength(ownData(current, 'errors')) > CLI_FAILURE_MAX_NODES) { return true; }
    current = aggregateMembers(current)[0];
  }
  return false;
}
