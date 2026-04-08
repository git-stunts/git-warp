// Regex for validating hex OID (4-64 hex characters)
const HEX_OID_REGEX = /^[0-9a-f]{4,64}$/;

/**
 * EventId — total ordering identity for CRDT operations (WARP spec Section 7).
 */
export class EventId {
  /** Monotonic counter (positive integer) */
  readonly lamport: number;

  /** Writer identifier (non-empty string) */
  readonly writerId: string;

  /** Patch commit SHA (hex OID, 4-64 chars) */
  readonly patchSha: string;

  /** Operation index within patch (non-negative integer) */
  readonly opIndex: number;

  /**
   * Creates a validated EventId.
   *
   * @param lamport - Must be positive integer (> 0)
   * @param writerId - Must be non-empty string
   * @param patchSha - Must be valid hex OID (4-64 chars)
   * @param opIndex - Must be non-negative integer (>= 0)
   */
  constructor(lamport: number, writerId: string, patchSha: string, opIndex: number) {
    if (!Number.isInteger(lamport) || lamport <= 0) {
      throw new Error('lamport must be a positive integer');
    }
    if (typeof writerId !== 'string' || writerId.length === 0) {
      throw new Error('writerId must be a non-empty string');
    }
    if (typeof patchSha !== 'string' || !HEX_OID_REGEX.test(patchSha)) {
      throw new Error('patchSha must be a hex string of 4-64 characters');
    }
    if (!Number.isInteger(opIndex) || opIndex < 0) {
      throw new Error('opIndex must be a non-negative integer');
    }

    this.lamport = lamport;
    this.writerId = writerId;
    this.patchSha = patchSha;
    this.opIndex = opIndex;
    Object.freeze(this);
  }
}

/**
 * Creates a validated EventId.
 */
export function createEventId(lamport: number, writerId: string, patchSha: string, opIndex: number): EventId {
  return new EventId(lamport, writerId, patchSha, opIndex);
}

/**
 * Compares two EventIds lexicographically.
 * Order: lamport -> writerId -> patchSha -> opIndex
 *
 * SHA tiebreaker uses lexicographic string comparison. This is arbitrary but
 * deterministic — the specific order doesn't matter as long as all writers agree.
 */
export function compareEventIds(a: EventId, b: EventId): number {
  // 1. Compare lamport numerically
  if (a.lamport !== b.lamport) {
    return a.lamport < b.lamport ? -1 : 1;
  }

  // 2. Compare writerId as string
  if (a.writerId !== b.writerId) {
    return a.writerId < b.writerId ? -1 : 1;
  }

  // 3. Compare patchSha as string (lexicographic — arbitrary but deterministic)
  if (a.patchSha !== b.patchSha) {
    return a.patchSha < b.patchSha ? -1 : 1;
  }

  // 4. Compare opIndex numerically
  if (a.opIndex !== b.opIndex) {
    return a.opIndex < b.opIndex ? -1 : 1;
  }

  return 0;
}

/**
 * Checks if EventId a is greater than EventId b.
 */
export function isGreater(a: EventId, b: EventId): boolean {
  return compareEventIds(a, b) > 0;
}
