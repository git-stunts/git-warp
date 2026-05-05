/**
 * ConflictDiagnostic — runtime-backed analysis warning or error.
 *
 * @module domain/types/conflict/ConflictDiagnostic
 */

import type { HashablePayload } from './HashablePayload.ts';
import { requireNonEmptyString, requireEnum, freezeOptionalDiagnosticData } from './validation.ts';

const CTX = 'ConflictDiagnostic';
const VALID_SEVERITIES = new Set(['warning', 'error']);

/**
 * Structural carrier for heterogeneous diagnostic metadata. Keys
 * are named; values are any hashable payload (primitive, nested
 * record, array, or already-constructed domain class instance such
 * as `ConflictAnchor`). Diagnostics are purely informational, so a
 * named structural bag — not a runtime class — is the right model.
 */
export type ConflictDiagnosticData = {
  readonly [key: string]: HashablePayload | undefined;
};

/**
 * A runtime-backed diagnostic emitted during conflict analysis.
 *
 * Instances are frozen on construction.
 */
export default class ConflictDiagnostic {
  readonly code: string;
  readonly severity: string;
  readonly message: string;
  readonly data: ConflictDiagnosticData | undefined;

  /**
   * Creates a frozen ConflictDiagnostic.
   */
  constructor({ code, severity, message, data }: {
    code: string;
    severity: 'warning' | 'error';
    message: string;
    data?: ConflictDiagnosticData;
  }) {
    this.code = requireNonEmptyString(code, 'code', CTX);
    this.severity = requireEnum(severity, VALID_SEVERITIES, { name: 'severity', context: CTX });
    this.message = requireNonEmptyString(message, 'message', CTX);
    this.data = freezeOptionalDiagnosticData(data);
    Object.freeze(this);
  }
}
