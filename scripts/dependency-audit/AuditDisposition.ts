// SPDX-License-Identifier: Apache-2.0

/** What the gate decided about one advisory or one exception. */
export const DISPOSITION = Object.freeze({
  /** The advisory reaches the published tree. No exception applies there. */
  PUBLISHED: 'published',
  /** A development-only advisory that no exception lists. */
  UNLISTED: 'unlisted',
  /** The exception was added in the future, or expires before it was added or too late. */
  INVALID_WINDOW: 'invalid-window',
  /** The exception's expiry date has passed. */
  EXPIRED: 'expired',
  /** The registry publishes a version outside the advisory's range: fix it instead. */
  PATCHED: 'patched',
  /** The exception matches no advisory at or above the audit level. */
  STALE: 'stale',
  /** A development-only advisory that a valid exception lists. */
  EXCEPTED: 'excepted',
  /** The advisory is below the audit level, so `npm audit --audit-level=low` ignores it too. */
  BELOW_LEVEL: 'below-level',
} as const);

export type AuditDisposition = (typeof DISPOSITION)[keyof typeof DISPOSITION];

const PASSING: ReadonlySet<AuditDisposition> = new Set([DISPOSITION.EXCEPTED, DISPOSITION.BELOW_LEVEL]);

/** True for the two dispositions that let the gate pass. */
export function dispositionPasses(disposition: AuditDisposition): boolean {
  return PASSING.has(disposition);
}
