// SPDX-License-Identifier: Apache-2.0

import { GATE_LABEL } from './AuditGateLabel.ts';

const REFUSAL_EXIT_CODE = 2;

/**
 * The gate could not establish the audit result, so it refuses to pass. A
 * failed `npm audit`, unreadable output, or a malformed exception file is a
 * refusal, never a pass.
 */
export class AuditRefusal {
  readonly reason: string;

  constructor(reason: string) {
    if (reason.length === 0) {
      throw new RangeError('An audit refusal needs a reason');
    }
    this.reason = reason;
    Object.freeze(this);
  }

  get exitCode(): number {
    return REFUSAL_EXIT_CODE;
  }

  reportLines(): readonly string[] {
    return [`${GATE_LABEL}: REFUSED: ${this.reason}`];
  }
}
