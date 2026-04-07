/**
 * ConflictAnalysisRequest — validated request object for conflict analysis.
 *
 * Owns the boundary parsing and normalization for analysis options so the
 * analyzer service can orchestrate instead of shape-checking raw bags.
 *
 * @module domain/services/strand/ConflictAnalysisRequest
 */

import QueryError from '../../errors/QueryError.js';

const VALID_KINDS = new Set(['supersession', 'eventual_override', 'redundancy']);
const VALID_EVIDENCE_LEVELS = new Set(['summary', 'standard', 'full']);
const VALID_TARGET_KINDS = new Set(['node', 'edge', 'node_property', 'edge_property']);
const TARGET_SELECTOR_FIELDS = ['entityId', 'propertyKey', 'from', 'to', 'label'];
const TARGET_REQUIREMENTS = Object.freeze({
  node: { fields: ['entityId'], message: 'node target selector requires entityId' },
  edge: { fields: ['from', 'to', 'label'], message: 'edge target selector requires from, to, and label' },
  node_property: { fields: ['entityId', 'propertyKey'], message: 'node_property selector requires entityId and propertyKey' },
  edge_property: { fields: ['from', 'to', 'label', 'propertyKey'], message: 'edge_property selector requires from, to, label, and propertyKey' },
});

/**
 * @typedef {{
 *   targetKind: 'node'|'edge'|'node_property'|'edge_property',
 *   entityId?: string,
 *   propertyKey?: string,
 *   from?: string,
 *   to?: string,
 *   label?: string
 * }} ConflictTargetSelector
 */


/**
 * Raw user-supplied analysis options accepted at the public API boundary.
 *
 * @typedef {{
 *   at?: { lamportCeiling?: number|null },
 *   strandId?: string,
 *   entityId?: string,
 *   target?: ConflictTargetSelector|null,
 *   kind?: string|string[],
 *   writerId?: string,
 *   evidence?: 'summary'|'standard'|'full',
 *   scanBudget?: { maxPatches?: number }
 * }} ConflictAnalyzeOptions
 */


/**
 * Runtime-backed normalized request for analyzer execution.
 */
export default class ConflictAnalysisRequest {
  /**
   * Creates a normalized immutable conflict analysis request.
   *
   * @param {{
   *   lamportCeiling: number|null,
   *   strandId: string|null,
   *   entityId: string|null,
   *   target: ConflictTargetSelector|null,
   *   kinds: string[]|null,
   *   writerId: string|null,
   *   evidence: 'summary'|'standard'|'full',
   *   maxPatches: number|null
   * }} options
   */
  constructor({
    lamportCeiling,
    strandId,
    entityId,
    target,
    kinds,
    writerId,
    evidence,
    maxPatches,
  }) {
    this.lamportCeiling = lamportCeiling;
    this.strandId = strandId;
    this.entityId = entityId;
    this.target = target === null ? null : Object.freeze({ ...target });
    this.kinds = kinds === null ? null : Object.freeze([...kinds]);
    this.writerId = writerId;
    this.evidence = evidence;
    this.maxPatches = maxPatches;
    Object.freeze(this);
  }

  /**
   * Parses raw user input into a validated request object.
   *
   * @param {ConflictAnalyzeOptions|null|undefined} options
   * @returns {ConflictAnalysisRequest}
   */
  static from(options) {
    const raw = options ?? {};
    return new ConflictAnalysisRequest({
      lamportCeiling: ConflictAnalysisRequest._normalizeLamportCeiling(raw.at?.lamportCeiling),
      strandId: ConflictAnalysisRequest._normalizeOptionalString('strandId', raw.strandId),
      entityId: ConflictAnalysisRequest._normalizeOptionalString('entityId', raw.entityId),
      target: ConflictAnalysisRequest._normalizeTarget(raw.target),
      kinds: ConflictAnalysisRequest._normalizeKinds(raw.kind),
      writerId: ConflictAnalysisRequest._normalizeOptionalString('writerId', raw.writerId),
      evidence: ConflictAnalysisRequest._normalizeEvidence(raw.evidence),
      maxPatches: ConflictAnalysisRequest._normalizeMaxPatches(raw.scanBudget?.maxPatches),
    });
  }

  /**
   * Reports whether the request resolves through a strand coordinate.
   *
   * @returns {boolean}
   */
  usesStrandCoordinate() {
    return this.strandId !== null;
  }

  /**
   * Builds the snapshot-hash filter record for this request.
   *
   * @returns {ConflictSnapshotFilterRecord}
   */
  /**
   * Tests whether a conflict trace passes all filters in this request.
   *
   * @param {{ kind: string, target: { touchesEntity: Function, matchesSelector: Function }, touchesWriter: Function }} trace - The trace to test.
   * @returns {boolean} True if the trace matches all criteria.
   */
  matchesTrace(trace) {
    if (this.kinds !== null && !this.kinds.includes(trace.kind)) {
      return false;
    }
    if (typeof this.entityId === 'string' && this.entityId.length > 0 && !trace.target.touchesEntity(this.entityId)) {
      return false;
    }
    if (this.target !== null && this.target !== undefined && !trace.target.matchesSelector(this.target)) {
      return false;
    }
    if (typeof this.writerId === 'string' && this.writerId.length > 0 && !trace.touchesWriter(this.writerId)) {
      return false;
    }
    return true;
  }

  /**
   * Returns a serializable record of the active filters for snapshot hashing.
   *
   * @returns {Record<string, unknown>}
   */
  toSnapshotFilterRecord() {
    return {
      entityId: this.entityId,
      target: ConflictAnalysisRequest._snapshotTarget(this.target),
      kind: this.kinds,
      writerId: this.writerId,
    };
  }

  /**
   * Normalizes an optional string boundary field.
   *
   * @param {string} field
   * @param {unknown} value
   * @returns {string|null}
   */
  static _normalizeOptionalString(field, value) {
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value !== 'string' || value.length === 0) {
      throw new QueryError(`analyzeConflicts(): ${field} must be a non-empty string when provided`, {
        code: 'unsupported_target_selector',
        context: { [field]: value },
      });
    }
    return value;
  }

  /**
   * Normalizes the lamport ceiling coordinate filter.
   *
   * @param {unknown} lamportCeiling
   * @returns {number|null}
   */
  static _normalizeLamportCeiling(lamportCeiling) {
    if (lamportCeiling === undefined || lamportCeiling === null) {
      return null;
    }
    if (!ConflictAnalysisRequest._isValidLamportCeiling(lamportCeiling)) {
      throw new QueryError('analyzeConflicts(): at.lamportCeiling must be a non-negative integer or null', {
        code: 'invalid_coordinate',
        context: { lamportCeiling },
      });
    }
    return lamportCeiling;
  }

  /**
   * Validates the raw target selector payload before normalization.
   *
   * @param {ConflictAnalyzeOptions['target']} target
   * @returns {ConflictTargetSelector|null}
   */
  static _normalizeTarget(target) {
    if (target === undefined || target === null) {
      return null;
    }
    if (typeof target !== 'object') {
      throw new QueryError('analyzeConflicts(): target selector must be an object', {
        code: 'unsupported_target_selector',
        context: { target },
      });
    }
    const selector = { ...target };
    ConflictAnalysisRequest._validateTarget(selector);
    return selector;
  }

  /**
   * Validates selector kind support and required fields.
   *
   * @param {ConflictTargetSelector} target
   * @returns {void}
   */
  static _validateTarget(target) {
    if (!VALID_TARGET_KINDS.has(target.targetKind)) {
      throw new QueryError('analyzeConflicts(): target.targetKind is unsupported', {
        code: 'unsupported_target_selector',
        context: { targetKind: target.targetKind },
      });
    }
    const requirement = TARGET_REQUIREMENTS[target.targetKind];
    ConflictAnalysisRequest._requireTargetFields(target, requirement.fields, requirement.message);
  }

  /**
   * Ensures every required selector field is present and non-empty.
   *
   * @param {ConflictTargetSelector} target
   * @param {Array<'entityId'|'propertyKey'|'from'|'to'|'label'>} fields
   * @param {string} message
   * @returns {void}
   */
  static _requireTargetFields(target, fields, message) {
    const valid = fields.every((field) => typeof target[field] === 'string' && target[field].length > 0);
    if (!valid) {
      throw new QueryError(`analyzeConflicts(): ${message}`, {
        code: 'unsupported_target_selector',
        context: { target },
      });
    }
  }

  /**
   * Normalizes and validates the conflict-kind filter.
   *
   * @param {ConflictAnalyzeOptions['kind']} kind
   * @returns {string[]|null}
   */
  static _normalizeKinds(kind) {
    if (kind === undefined) {
      return null;
    }
    const values = Array.isArray(kind) ? kind : [kind];
    ConflictAnalysisRequest._validateKinds(values, kind);
    return [...new Set(values)].sort();
  }

  /**
   * Normalizes the evidence verbosity selector.
   *
   * @param {unknown} evidence
   * @returns {'summary'|'standard'|'full'}
   */
  static _normalizeEvidence(evidence) {
    const normalized = evidence === undefined || evidence === null ? 'standard' : evidence;
    if (typeof normalized !== 'string' || !VALID_EVIDENCE_LEVELS.has(normalized)) {
      throw new QueryError('analyzeConflicts(): evidence must be summary, standard, or full', {
        code: 'unsupported_target_selector',
        context: { evidence },
      });
    }
    return normalized;
  }

  /**
   * Normalizes the patch scan budget.
   *
   * @param {unknown} maxPatches
   * @returns {number|null}
   */
  static _normalizeMaxPatches(maxPatches) {
    if (maxPatches === undefined) {
      return null;
    }
    if (
      typeof maxPatches !== 'number' ||
      !Number.isInteger(maxPatches) ||
      maxPatches < 1
    ) {
      throw new QueryError('analyzeConflicts(): scanBudget.maxPatches must be a positive integer', {
        code: 'unsupported_target_selector',
        context: { maxPatches },
      });
    }
    return maxPatches;
  }

  /**
   * Serializes the target selector for snapshot hashing.
   *
   * @param {ConflictTargetSelector|null} selector
   * @returns {ConflictSnapshotTarget|null}
   */
  static _snapshotTarget(selector) {
    if (selector === null) {
      return null;
    }
    const result = { targetKind: selector.targetKind };
    for (const field of TARGET_SELECTOR_FIELDS) {
      if (selector[field] !== undefined) {
        result[field] = selector[field];
      }
    }
    return result;
  }

  /**
   * Checks whether a lamport ceiling value is a valid non-negative integer.
   *
   * @param {unknown} lamportCeiling
   * @returns {lamportCeiling is number}
   */
  static _isValidLamportCeiling(lamportCeiling) {
    return (
      typeof lamportCeiling === 'number' &&
      Number.isInteger(lamportCeiling) &&
      lamportCeiling >= 0
    );
  }

  /**
   * Validates the normalized kind filter array.
   *
   * @param {unknown[]} values
   * @param {ConflictAnalyzeOptions['kind']} kind
   * @returns {void}
   */
  static _validateKinds(values, kind) {
    if (values.length === 0) {
      throw new QueryError('analyzeConflicts(): kind filter must not be empty', {
        code: 'unsupported_target_selector',
        context: { kind },
      });
    }
    for (const value of values) {
      if (typeof value !== 'string' || !VALID_KINDS.has(value)) {
        throw new QueryError('analyzeConflicts(): kind filter contains an unsupported value', {
          code: 'unsupported_target_selector',
          context: { kind },
        });
      }
    }
  }
}
