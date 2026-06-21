import QueryError from '../../errors/QueryError.ts';

export function requireNonEmptyString(value: string, field: string, errorCode: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new QueryError(`${field} must be a non-empty string`, {
      code: errorCode,
      context: { field },
    });
  }
  return value.trim();
}

export function freezeStringList(
  values: readonly string[],
  field: string,
  errorCode: string,
): readonly string[] {
  if (!Array.isArray(values)) {
    throw new QueryError(`${field} must be an array`, {
      code: errorCode,
      context: { field },
    });
  }
  const normalized: string[] = [];
  for (const value of values) {
    normalized.push(requireNonEmptyString(value, field, errorCode));
  }
  return Object.freeze([...new Set(normalized)].sort());
}
