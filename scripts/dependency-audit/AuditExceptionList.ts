// SPDX-License-Identifier: Apache-2.0

import type { AuditAdvisory } from './AuditAdvisory.ts';
import type { AuditException } from './AuditException.ts';
import { AuditRefusal } from './AuditRefusal.ts';

/** The repository-relative path of the committed exception list. */
export const AUDIT_EXCEPTIONS_PATH = 'policy/audit-exceptions.json';

/** The committed exceptions, at most one for each advisory and package. */
export class AuditExceptionList {
  readonly exceptions: readonly AuditException[];

  private constructor(exceptions: readonly AuditException[]) {
    this.exceptions = Object.freeze([...exceptions]);
    Object.freeze(this);
  }

  /** Builds the list, or refuses when two exceptions name the same advisory and package. */
  static of(exceptions: readonly AuditException[]): AuditExceptionList | AuditRefusal {
    const keys = exceptions.map((exception) => `${exception.advisory} ${exception.packageName}`);
    const duplicate = keys.find((key, index) => keys.indexOf(key) !== index);
    return duplicate === undefined
      ? new AuditExceptionList(exceptions)
      : new AuditRefusal(`${AUDIT_EXCEPTIONS_PATH} lists ${duplicate} more than once`);
  }

  /** The exception that covers the advisory, if there is one. */
  find(advisory: AuditAdvisory): AuditException | undefined {
    return this.exceptions.find((exception) => exception.covers(advisory));
  }
}
