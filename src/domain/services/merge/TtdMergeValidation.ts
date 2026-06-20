import WarpError from '../../errors/WarpError.ts';

const ERROR_CODE = 'E_TTD_MERGE_INSPECTION_INVALID';

export function requireNonEmptyText(value: string, fieldName: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WarpError(`${fieldName} must be a non-empty string`, ERROR_CODE);
  }
  return value;
}

function requireRecordContainer(fields: Record<string, string>, fieldName: string): void {
  if (fields === null || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new WarpError(`${fieldName} must be an object`, ERROR_CODE);
  }
}

function requireRecordEntry(key: string, value: string, fieldName: string): void {
  if (key.length === 0) {
    throw new WarpError(`${fieldName} cannot contain an empty key`, ERROR_CODE);
  }
  if (typeof value !== 'string') {
    throw new WarpError(`${fieldName}.${key} must be a string`, ERROR_CODE);
  }
}

function copyStringRecord(fields: Record<string, string>, fieldName: string): Record<string, string> {
  const copy: Record<string, string> = {};
  for (const [key, value] of Object.entries(fields)) {
    requireRecordEntry(key, value, fieldName);
    copy[key] = value;
  }
  return copy;
}

export function requireStringRecord(fields: Record<string, string>, fieldName: string): Readonly<Record<string, string>> {
  requireRecordContainer(fields, fieldName);
  const copy = copyStringRecord(fields, fieldName);
  return freezeSortedRecord(copy);
}

export function freezeSortedRecord(fields: Record<string, string>): Readonly<Record<string, string>> {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(fields).sort()) {
    const value = fields[key];
    if (value === undefined) {
      throw new WarpError(`${key} must have a string value`, ERROR_CODE);
    }
    sorted[key] = value;
  }
  return Object.freeze(sorted);
}

export function freezeSortedTexts(values: readonly string[], fieldName: string): readonly string[] {
  for (const value of values) {
    requireNonEmptyText(value, fieldName);
  }
  return Object.freeze([...new Set(values)].sort());
}

export function requireNonNegativeInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new WarpError(`${fieldName} must be a non-negative integer`, ERROR_CODE);
  }
  return value;
}
