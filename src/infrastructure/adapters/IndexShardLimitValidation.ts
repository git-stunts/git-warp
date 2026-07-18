import IndexError from '../../domain/errors/IndexError.ts';
import type { CborStructureLimits } from './BoundedCborValidation.ts';

type OptionalCborStructureLimits = Readonly<{
  maxContainerEntries?: number;
  maxDepth?: number;
  maxItems?: number;
}>;

export function optionalCborStructureLimits(
  options: OptionalCborStructureLimits,
): CborStructureLimits | undefined {
  const configured = [
    options.maxContainerEntries,
    options.maxDepth,
    options.maxItems,
  ].filter((value) => value !== undefined).length;
  if (configured === 0) {
    return undefined;
  }
  if (configured !== 3) {
    throw invalidLimit('CBOR structure limits');
  }
  return Object.freeze({
    maxContainerEntries: positiveInteger(
      options.maxContainerEntries!,
      'maxContainerEntries',
    ),
    maxDepth: nonNegativeInteger(options.maxDepth!, 'maxDepth'),
    maxItems: positiveInteger(options.maxItems!, 'maxItems'),
  });
}

export function optionalPositiveInteger(
  value: number | undefined,
  name: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return positiveInteger(value, name);
}

export function optionalNonNegativeInteger(
  value: number | undefined,
  name: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  return nonNegativeInteger(value, name);
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw invalidLimit(name);
  }
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
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
