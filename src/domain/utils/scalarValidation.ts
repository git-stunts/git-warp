import WarpError from '../errors/WarpError.ts';

export function requireNonEmptyString(value: string, name: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
}

export function validateTimestamp(value: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new WarpError('timestamp must be a non-negative finite number', 'E_VALIDATION');
  }
}
