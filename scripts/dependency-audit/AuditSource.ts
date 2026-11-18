// SPDX-License-Identifier: Apache-2.0

import type { AuditRefusal } from './AuditRefusal.ts';
import type { AuditReport } from './AuditReport.ts';

/** Port: runs `npm audit` over the committed lock. */
export interface AuditSource {
  /** The published tree: production, optional and peer dependencies (`--omit=dev`). */
  auditPublishedTree(): Promise<AuditReport | AuditRefusal>;
  /** The complete locked tree, development dependencies included. */
  auditFullTree(): Promise<AuditReport | AuditRefusal>;
}
