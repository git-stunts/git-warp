/**
 * ConflictDiagnostic — runtime-backed analysis warning or error.
 *
 * @module domain/types/conflict/ConflictDiagnostic
 */

import { requireNonEmptyString, requireEnum, freezeOptionalObject } from './validation.js';

const CTX = 'ConflictDiagnostic';
const VALID_SEVERITIES = new Set(['warning', 'error']);

/**
 * A runtime-backed diagnostic emitted during conflict analysis.
 *
 * Instances are frozen on construction.
 */
export default class ConflictDiagnostic {
  /**
   * Creates a frozen ConflictDiagnostic.
   *
   * @param {{
   *   code: string,
   *   severity: 'warning'|'error',
   *   message: string,
   *   data?: Record<string, unknown>
   * }} fields - Diagnostic fields.
   */
  constructor({ code, severity, message, data }) {
    this.code = requireNonEmptyString(code, 'code', CTX);
    this.severity = requireEnum(severity, VALID_SEVERITIES, { name: 'severity', context: CTX });
    this.message = requireNonEmptyString(message, 'message', CTX);
    this.data = freezeOptionalObject(data);
    Object.freeze(this);
  }
}
