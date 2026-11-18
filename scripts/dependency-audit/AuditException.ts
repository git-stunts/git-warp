// SPDX-License-Identifier: Apache-2.0

import type { AuditAdvisory } from './AuditAdvisory.ts';
import { DISPOSITION, type AuditDisposition } from './AuditDisposition.ts';
import type { CalendarDate } from './CalendarDate.ts';

/** An exception expires at most this many days after the day it was added. */
export const MAX_EXCEPTION_DAYS = 30;

export type AuditExceptionFields = {
  /** The GHSA identifier. */
  readonly advisory: string;
  readonly packageName: string;
  readonly reason: string;
  readonly added: CalendarDate;
  /** The last day on which the exception applies. */
  readonly expires: CalendarDate;
  /** The issue or pull request that owns the removal, as `owner/repo#N`. */
  readonly owner: string;
};

/** One reason why an exception does not apply on a given day. */
export type ExceptionProblem = {
  readonly disposition: AuditDisposition;
  readonly detail: string;
};

type ExceptionRule = (exception: AuditException, today: CalendarDate) => readonly ExceptionProblem[];

/** One reviewed, expiring exception for a development-dependency advisory. */
export class AuditException {
  readonly advisory: string;
  readonly packageName: string;
  readonly reason: string;
  readonly added: CalendarDate;
  readonly expires: CalendarDate;
  readonly owner: string;

  constructor(fields: AuditExceptionFields) {
    const text = [fields.advisory, fields.packageName, fields.reason.trim(), fields.owner];
    if (text.some((value) => value.length === 0)) {
      throw new RangeError('An audit exception needs an advisory, a package, a reason and an owner');
    }
    this.advisory = fields.advisory;
    this.packageName = fields.packageName;
    this.reason = fields.reason;
    this.added = fields.added;
    this.expires = fields.expires;
    this.owner = fields.owner;
    Object.freeze(this);
  }

  /** True when this exception names the advisory and its package. */
  covers(advisory: AuditAdvisory): boolean {
    return advisory.id === this.advisory && advisory.packageName === this.packageName;
  }

  /** Why the exception does not apply on `today`, window problems first. Empty when it applies. */
  problemsOn(today: CalendarDate): readonly ExceptionProblem[] {
    return EXCEPTION_RULES.flatMap((rule) => rule(this, today));
  }
}

function invalidWindow(detail: string): readonly ExceptionProblem[] {
  return [{ disposition: DISPOSITION.INVALID_WINDOW, detail }];
}

const EXCEPTION_RULES: readonly ExceptionRule[] = Object.freeze([
  (exception, today) => today.daysUntil(exception.added) > 0
    ? invalidWindow(`added ${exception.added.iso}, which is after today (${today.iso})`)
    : [],
  (exception) => exception.added.daysUntil(exception.expires) < 0
    ? invalidWindow(`expires ${exception.expires.iso}, before it was added (${exception.added.iso})`)
    : [],
  (exception) => exception.added.daysUntil(exception.expires) > MAX_EXCEPTION_DAYS
    ? invalidWindow(`expires ${exception.added.daysUntil(exception.expires)} days after it was added; the limit is ${MAX_EXCEPTION_DAYS}`)
    : [],
  (exception, today) => today.daysUntil(exception.expires) < 0
    ? [{ disposition: DISPOSITION.EXPIRED, detail: `expired after ${exception.expires.iso}` }]
    : [],
]);
