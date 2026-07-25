import WarpError from '../errors/WarpError.ts';

const MAX_SAVED_CURSOR_NAME_LENGTH = 64;
const SAVED_CURSOR_NAME_PATTERN = /^[A-Za-z0-9._-]+$/u;
const PATH_TRAVERSAL_PATTERN = /\.\./u;
const ERROR_CODE = 'E_INVALID_CURSOR_NAME';
const ERROR_PREFIX = 'Invalid saved cursor name';

/** Validates one durable seek-cursor bookmark name. */
export function validateSavedCursorName(name: string): void {
  if (typeof name !== 'string') {
    throw invalidName(`expected string, got ${typeof name}`);
  }
  if (name.length === 0) {
    throw invalidName('cannot be empty');
  }
  if (name.length > MAX_SAVED_CURSOR_NAME_LENGTH) {
    throw invalidName(
      `exceeds maximum length of ${MAX_SAVED_CURSOR_NAME_LENGTH} characters: ${name.length}`,
    );
  }
  rejectSavedCursorPathChars(name);
  rejectSavedCursorControlChars(name);
}

function rejectSavedCursorPathChars(name: string): void {
  if (PATH_TRAVERSAL_PATTERN.test(name)) {
    throw invalidName(`contains path traversal sequence '..': ${name}`);
  }
  if (name.includes('/')) {
    throw invalidName(`contains forward slash: ${name}`);
  }
}

function rejectSavedCursorControlChars(name: string): void {
  if (name.includes('\0')) {
    throw invalidName(`contains null byte: ${name}`);
  }
  if (/\s/u.test(name)) {
    throw invalidName(`contains whitespace: ${name}`);
  }
  if (!SAVED_CURSOR_NAME_PATTERN.test(name)) {
    throw invalidName(
      `contains invalid characters (only [A-Za-z0-9._-] allowed): ${name}`,
    );
  }
}

function invalidName(detail: string): WarpError {
  return new WarpError(`${ERROR_PREFIX}: ${detail}`, ERROR_CODE);
}
