import IndexError from '../../domain/errors/IndexError.ts';
import type { CborStructureLimits } from './BoundedCborValidation.ts';

export function optionalCborStructureLimits(
  value: unknown,
): CborStructureLimits | undefined {
  if (value === undefined) {
    return undefined;
  }
  const limits = requireStructureLimitRecord(value);
  requireCompleteStructureLimits(limits);
  return Object.freeze({
    maxContainerEntries: positiveInteger(
      limits['maxContainerEntries'],
      'maxContainerEntries',
    ),
    maxDepth: nonNegativeInteger(limits['maxDepth'], 'maxDepth'),
    maxItems: positiveInteger(limits['maxItems'], 'maxItems'),
  });
}

function requireStructureLimitRecord(
  value: unknown,
): Readonly<Record<string, unknown>> { // nosemgrep: ts-no-record-string-unknown-outside-adapters -- adapter validation boundary; nosemgrep: ts-no-unknown-outside-adapters -- adapter validation boundary
  if (value === null || typeof value !== 'object') {
    throw invalidLimit('CBOR structure limits');
  }
  return value as Readonly<Record<string, unknown>>; // nosemgrep: ts-no-record-string-unknown-outside-adapters -- adapter validation boundary; nosemgrep: ts-no-unknown-outside-adapters -- adapter validation boundary
}

function requireCompleteStructureLimits(
  limits: Readonly<Record<string, unknown>>, // nosemgrep: ts-no-record-string-unknown-outside-adapters -- adapter validation boundary; nosemgrep: ts-no-unknown-outside-adapters -- adapter validation boundary
): void {
  if (
    !hasOwnDefinedLimit(limits, 'maxContainerEntries')
    || !hasOwnDefinedLimit(limits, 'maxDepth')
    || !hasOwnDefinedLimit(limits, 'maxItems')
  ) {
    throw invalidLimit('CBOR structure limits');
  }
}

function hasOwnDefinedLimit(
  limits: Readonly<Record<string, unknown>>, // nosemgrep: ts-no-record-string-unknown-outside-adapters -- adapter validation boundary; nosemgrep: ts-no-unknown-outside-adapters -- adapter validation boundary
  name: string,
): boolean {
  return Object.hasOwn(limits, name) && limits[name] !== undefined;
}

export function optionalPositiveInteger(
  value: unknown,
  name: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return positiveInteger(value, name);
}

export function optionalNonNegativeInteger(
  value: unknown,
  name: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return nonNegativeInteger(value, name);
}

function positiveInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw invalidLimit(name);
  }
  return value;
}

function nonNegativeInteger(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw invalidLimit(name);
  }
  return value;
}

export function invalidLimit(name: string): IndexError {
  return new IndexError(`Index shard ${name} must be a safe integer within range`, {
    code: 'E_INDEX_INVALID_LIMIT',
    context: { name },
  });
}
