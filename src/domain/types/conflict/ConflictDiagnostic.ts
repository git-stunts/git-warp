/**
 * ConflictDiagnostic — runtime-backed analysis warning or error.
 *
 * @module domain/types/conflict/ConflictDiagnostic
 */

import { requireNonEmptyString, requireEnum, freezeOptionalObject } from './validation.ts';

const CTX = 'ConflictDiagnostic';
const VALID_SEVERITIES = new Set(['warning', 'error']);

/**
 * A runtime-backed diagnostic emitted during conflict analysis.
 *
 * Instances are frozen on construction.
 */
export default class ConflictDiagnostic {
  readonly code: string;
  readonly severity: string;
  readonly message: string;
  readonly data: Record<string, unknown> | undefined;

  /**
   * Creates a frozen ConflictDiagnostic.
   */
  constructor({ code, severity, message, data }: {
    code: string;
    severity: 'warning' | 'error';
    message: string;
    data?: Record<string, unknown>;
  }) {
    this.code = requireNonEmptyString(code, 'code', CTX);
    this.severity = requireEnum(severity, VALID_SEVERITIES, { name: 'severity', context: CTX });
    this.message = requireNonEmptyString(message, 'message', CTX);
    this.data = freezeOptionalObject(data);
    Object.freeze(this);
  }
}
