// SPDX-License-Identifier: Apache-2.0

import type { DeterminismViolation } from './DeterminismViolation.ts';

const PASSED_EXIT_CODE = 0;
const VIOLATION_EXIT_CODE = 1;

function countOf(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * A completed scan of at least one domain file. A scan that read no file is
 * not a scan; the gate reports it as a DeterminismScanRefusal instead.
 */
export class DeterminismScan {
  readonly scannedFileCount: number;
  readonly violations: readonly DeterminismViolation[];

  constructor(scannedFileCount: number, violations: readonly DeterminismViolation[]) {
    if (!Number.isSafeInteger(scannedFileCount) || scannedFileCount < 1) {
      throw new RangeError(`A determinism scan reads at least one file; got ${scannedFileCount}`);
    }
    this.scannedFileCount = scannedFileCount;
    this.violations = Object.freeze([...violations]);
    Object.freeze(this);
  }

  get exitCode(): number {
    return this.violations.length === 0 ? PASSED_EXIT_CODE : VIOLATION_EXIT_CODE;
  }

  reportLines(): readonly string[] {
    const scanned = `${countOf(this.scannedFileCount, 'domain file')} scanned`;
    if (this.violations.length === 0) {
      return [`ban-nondeterminism: PASSED (${scanned}).`];
    }
    return [
      ...this.violations.map((violation) => violation.toString()),
      `ban-nondeterminism: FAILED (${countOf(this.violations.length, 'violation')}, ${scanned}).`,
      'Move the effect behind a port (ClockPort, RandomPort) or pass the value in. There is no allowlist.',
    ];
  }
}
