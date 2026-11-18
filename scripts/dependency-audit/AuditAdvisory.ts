// SPDX-License-Identifier: Apache-2.0

import type { AuditSeverity } from './AuditSeverity.ts';

/** A GitHub advisory identifier, such as GHSA-fc5q-39xc-vjpf. */
export const GHSA_ID = /^GHSA(?:-[23456789cfghjmpqrvwx]{4}){3}$/u;

const GHSA_URL_PREFIX = 'https://github.com/advisories/';

export type AuditAdvisoryFields = {
  /** npm's numeric advisory identifier. */
  readonly source: number;
  readonly url: string;
  readonly packageName: string;
  readonly severity: AuditSeverity;
  /** The versions of the package that the advisory covers, such as `<=4.0.7`. */
  readonly vulnerableRange: string;
  readonly title: string;
};

/** One advisory against one vulnerable package, as an `npm audit --json` report names it. */
export class AuditAdvisory {
  /** The GHSA identifier, or `npm-advisory-<source>` when the advisory URL names no GHSA. */
  readonly id: string;
  readonly packageName: string;
  readonly severity: AuditSeverity;
  readonly vulnerableRange: string;
  readonly title: string;

  constructor(fields: AuditAdvisoryFields) {
    if (fields.packageName.length === 0 || fields.vulnerableRange.length === 0) {
      throw new RangeError('An audit advisory needs a package name and a vulnerable range');
    }
    this.id = advisoryId(fields);
    this.packageName = fields.packageName;
    this.severity = fields.severity;
    this.vulnerableRange = fields.vulnerableRange;
    this.title = fields.title;
    Object.freeze(this);
  }

  /** Identifies the advisory and package together; one package can have several advisories. */
  get key(): string {
    return `${this.id} ${this.packageName}`;
  }
}

function advisoryId(fields: AuditAdvisoryFields): string {
  const candidate = fields.url.startsWith(GHSA_URL_PREFIX) ? fields.url.slice(GHSA_URL_PREFIX.length) : '';
  return GHSA_ID.test(candidate) ? candidate : `npm-advisory-${fields.source}`;
}
