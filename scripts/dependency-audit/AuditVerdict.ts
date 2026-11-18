// SPDX-License-Identifier: Apache-2.0

import { dispositionPasses, type AuditDisposition } from './AuditDisposition.ts';

/** Where an advisory was found. A stale exception has no tree. */
export const AUDIT_TREE = Object.freeze({
  PUBLISHED: 'published',
  DEVELOPMENT: 'development',
  NONE: '-',
} as const);

export type AuditTree = (typeof AUDIT_TREE)[keyof typeof AUDIT_TREE];

export type AuditVerdictFields = {
  readonly advisory: string;
  readonly packageName: string;
  /** An npm severity, or `-` for a stale exception. */
  readonly severity: string;
  readonly tree: AuditTree;
  readonly disposition: AuditDisposition;
  readonly details: readonly string[];
};

/** The gate's decision about one advisory, or about one exception that matches no advisory. */
export class AuditVerdict {
  readonly advisory: string;
  readonly packageName: string;
  readonly severity: string;
  readonly tree: AuditTree;
  readonly disposition: AuditDisposition;
  readonly details: readonly string[];

  constructor(fields: AuditVerdictFields) {
    if (fields.details.length === 0) {
      throw new RangeError('An audit verdict needs at least one detail');
    }
    this.advisory = fields.advisory;
    this.packageName = fields.packageName;
    this.severity = fields.severity;
    this.tree = fields.tree;
    this.disposition = fields.disposition;
    this.details = Object.freeze([...fields.details]);
    Object.freeze(this);
  }

  get passed(): boolean {
    return dispositionPasses(this.disposition);
  }
}
