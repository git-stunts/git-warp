import IndexError from '../../domain/errors/IndexError.ts';

export function optionalPositiveInteger(
  value: number | undefined,
  name: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw invalidLimit(name);
  }
  return value;
}

export function optionalNonNegativeInteger(
  value: number | undefined,
  name: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw invalidLimit(name);
  }
  return value;
}

export function requiredPositiveInteger(value: number | undefined, name: string): number {
  const checked = optionalPositiveInteger(value, name);
  if (checked === undefined) {
    throw invalidLimit(name);
  }
  return checked;
}

export function requiredNonNegativeInteger(value: number | undefined, name: string): number {
  const checked = optionalNonNegativeInteger(value, name);
  if (checked === undefined) {
    throw invalidLimit(name);
  }
  return checked;
}

export function invalidLimit(name: string): IndexError {
  return new IndexError(`Index shard ${name} must be a safe integer within range`, {
    code: 'E_INDEX_INVALID_LIMIT',
    context: { name },
  });
}
