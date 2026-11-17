// SPDX-License-Identifier: Apache-2.0

const REFUSAL_EXIT_CODE = 2;

/**
 * The gate could not establish that it read the domain, so it refuses to
 * pass. A determinism gate that scans nothing must never report success.
 */
export class DeterminismScanRefusal {
  readonly reason: string;

  constructor(reason: string) {
    if (reason.length === 0) {
      throw new RangeError('A determinism scan refusal needs a reason');
    }
    this.reason = reason;
    Object.freeze(this);
  }

  get exitCode(): number {
    return REFUSAL_EXIT_CODE;
  }

  reportLines(): readonly string[] {
    return [`ban-nondeterminism: REFUSED: ${this.reason}.`];
  }
}
