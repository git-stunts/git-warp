import CrdtError from '../errors/CrdtError.ts';

const STRAND_ID_PATTERN = /^[0-9a-f]{64}$/;

/**
 * Throws unless `strandId` is an immutable strand id (#1014): the 64-hex
 * sha256 of the strand's genesis record. Friendly names are not ids.
 */
export function requireStrandId(strandId: string): string {
  if (typeof strandId !== 'string' || !STRAND_ID_PATTERN.test(strandId)) {
    throw new CrdtError(`Invalid strand id: ${String(strandId)}`, {
      code: 'E_CRDT_INVALID_STRAND_ID',
      context: { strandId },
    });
  }
  return strandId;
}

/** True when `value` is an immutable strand id rather than a friendly name. */
export function isStrandId(value: string): boolean {
  return typeof value === 'string' && STRAND_ID_PATTERN.test(value);
}
