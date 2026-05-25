import WarpError from '../errors/WarpError.ts';

/** Validates required migration string fields at runtime boundaries. */
export function requireGraphModelMigrationNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}
