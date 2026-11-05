const OBJECT_ID_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;

/** True for a canonical SHA-1 or SHA-256 Git object id. */
export function isObjectId(value: string): boolean {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value);
}
