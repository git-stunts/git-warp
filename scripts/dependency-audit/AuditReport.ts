// SPDX-License-Identifier: Apache-2.0

import type { AuditAdvisory } from './AuditAdvisory.ts';

export type AuditReportFields = {
  readonly advisories: readonly AuditAdvisory[];
  /** Packages in the locked tree, as `metadata.dependencies.total` counts them. */
  readonly lockedPackages: number;
  /** Packages that npm marks vulnerable, including packages that only depend on one. */
  readonly vulnerablePackages: number;
};

/** The advisories that one `npm audit --json` run found, each advisory and package once. */
export class AuditReport {
  readonly advisories: readonly AuditAdvisory[];
  readonly lockedPackages: number;
  readonly vulnerablePackages: number;

  constructor(fields: AuditReportFields) {
    if (!Number.isSafeInteger(fields.lockedPackages) || fields.lockedPackages < 1) {
      throw new RangeError('An audit report that covers no locked package proves nothing');
    }
    const unique = new Map(fields.advisories.map((advisory) => [advisory.key, advisory]));
    this.advisories = Object.freeze([...unique.values()]);
    this.lockedPackages = fields.lockedPackages;
    this.vulnerablePackages = fields.vulnerablePackages;
    Object.freeze(this);
  }
}
