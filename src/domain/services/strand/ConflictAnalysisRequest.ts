/**
 * ConflictAnalysisRequest — validated request object for conflict analysis.
 *
 * Owns the boundary parsing and normalization for analysis options so the
 * analyzer service can orchestrate instead of shape-checking raw bags.
 *
 * @module domain/services/strand/ConflictAnalysisRequest
 */

import QueryError from '../../errors/QueryError.ts';

const VALID_KINDS = new Set(['supersession', 'eventual_override', 'redundancy']);
const VALID_EVIDENCE_LEVELS = new Set(['summary', 'standard', 'full']);
const VALID_TARGET_KINDS = new Set(['node', 'edge', 'node_property', 'edge_property']);
const TARGET_SELECTOR_FIELDS = ['entityId', 'propertyKey', 'from', 'to', 'label'] as const;
type TargetSelectorField = typeof TARGET_SELECTOR_FIELDS[number];

const TARGET_REQUIREMENTS: Record<string, { fields: TargetSelectorField[]; message: string }> = Object.freeze({
  node: { fields: ['entityId'], message: 'node target selector requires entityId' },
  edge: { fields: ['from', 'to', 'label'], message: 'edge target selector requires from, to, and label' },
  node_property: { fields: ['entityId', 'propertyKey'], message: 'node_property selector requires entityId and propertyKey' },
  edge_property: { fields: ['from', 'to', 'label', 'propertyKey'], message: 'edge_property selector requires from, to, label, and propertyKey' },
});

export type ConflictTargetSelector = {
  targetKind: 'node' | 'edge' | 'node_property' | 'edge_property';
  entityId?: string;
  propertyKey?: string;
  from?: string;
  to?: string;
  label?: string;
};

/** Raw user-supplied analysis options accepted at the public API boundary. */
export type ConflictAnalyzeOptions = {
  at?: { lamportCeiling?: number | null };
  strandId?: string;
  entityId?: string;
  target?: ConflictTargetSelector | null;
  kind?: string | string[];
  writerId?: string;
  evidence?: 'summary' | 'standard' | 'full';
  scanBudget?: { maxPatches?: number };
};

type EvidenceLevel = 'summary' | 'standard' | 'full';

type TraceFilter = {
  kind: string;
  target: {
    touchesEntity(entityId: string): boolean;
    matchesSelector(selector: ConflictTargetSelector): boolean;
  };
  touchesWriter(writerId: string): boolean;
};

/**
 * Runtime-backed normalized request for analyzer execution.
 */
export default class ConflictAnalysisRequest {
  readonly lamportCeiling: number | null;
  readonly strandId: string | null;
  readonly entityId: string | null;
  readonly target: Readonly<ConflictTargetSelector> | null;
  readonly kinds: readonly string[] | null;
  readonly writerId: string | null;
  readonly evidence: EvidenceLevel;
  readonly maxPatches: number | null;

  constructor({
    lamportCeiling,
    strandId,
    entityId,
    target,
    kinds,
    writerId,
    evidence,
    maxPatches,
  }: {
    lamportCeiling: number | null;
    strandId: string | null;
    entityId: string | null;
    target: ConflictTargetSelector | null;
    kinds: string[] | null;
    writerId: string | null;
    evidence: EvidenceLevel;
    maxPatches: number | null;
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
   */
  static from(options: ConflictAnalyzeOptions | null | undefined): ConflictAnalysisRequest {
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
   */
  usesStrandCoordinate(): boolean {
    return this.strandId !== null;
  }

  /**
   * Tests whether a conflict trace passes all filters in this request.
   */
  matchesTrace(trace: TraceFilter): boolean {
    return (
      this._passesKindFilter(trace) &&
      this._passesEntityFilter(trace) &&
      this._passesTargetFilter(trace) &&
      this._passesWriterFilter(trace)
    );
  }

  private _passesKindFilter(trace: TraceFilter): boolean {
    return this.kinds === null || this.kinds.includes(trace.kind);
  }

  private _passesEntityFilter(trace: TraceFilter): boolean {
    if (typeof this.entityId !== 'string' || this.entityId.length === 0) {
      return true;
    }
    return trace.target.touchesEntity(this.entityId);
  }

  private _passesTargetFilter(trace: TraceFilter): boolean {
    if (this.target === null || this.target === undefined) {
      return true;
    }
    return trace.target.matchesSelector(this.target);
  }

  private _passesWriterFilter(trace: TraceFilter): boolean {
    if (typeof this.writerId !== 'string' || this.writerId.length === 0) {
      return true;
    }
    return trace.touchesWriter(this.writerId);
  }

  /**
   * Returns a serializable record of the active filters for snapshot hashing.
   */
  toSnapshotFilterRecord(): Record<string, unknown> {
    return {
      entityId: this.entityId,
      target: ConflictAnalysisRequest._snapshotTarget(this.target),
      kind: this.kinds,
      writerId: this.writerId,
    };
  }

  private static _normalizeOptionalString(field: string, value: unknown): string | null {
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

  private static _normalizeLamportCeiling(lamportCeiling: unknown): number | null {
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

  private static _normalizeTarget(target: ConflictAnalyzeOptions['target']): ConflictTargetSelector | null {
    if (target === undefined || target === null) {
      return null;
    }
    if (typeof target !== 'object') {
      throw new QueryError('analyzeConflicts(): target selector must be an object', {
        code: 'unsupported_target_selector',
        context: { target },
      });
    }
    const selector = { ...target } as ConflictTargetSelector;
    ConflictAnalysisRequest._validateTarget(selector);
    return selector;
  }

  private static _validateTarget(target: ConflictTargetSelector): void {
    if (!VALID_TARGET_KINDS.has(target.targetKind)) {
      throw new QueryError('analyzeConflicts(): target.targetKind is unsupported', {
        code: 'unsupported_target_selector',
        context: { targetKind: target.targetKind },
      });
    }
    const requirement = TARGET_REQUIREMENTS[target.targetKind];
    ConflictAnalysisRequest._requireTargetFields(target, requirement.fields, requirement.message);
  }

  private static _requireTargetFields(
    target: ConflictTargetSelector,
    fields: TargetSelectorField[],
    message: string,
  ): void {
    const valid = fields.every((field) => typeof target[field] === 'string' && (target[field] as string).length > 0);
    if (!valid) {
      throw new QueryError(`analyzeConflicts(): ${message}`, {
        code: 'unsupported_target_selector',
        context: { target },
      });
    }
  }

  private static _normalizeKinds(kind: ConflictAnalyzeOptions['kind']): string[] | null {
    if (kind === undefined) {
      return null;
    }
    const values = Array.isArray(kind) ? kind : [kind];
    ConflictAnalysisRequest._validateKinds(values, kind);
    return [...new Set(values)].sort();
  }

  private static _normalizeEvidence(evidence: unknown): EvidenceLevel {
    const normalized = evidence === undefined || evidence === null ? 'standard' : evidence;
    if (typeof normalized !== 'string' || !VALID_EVIDENCE_LEVELS.has(normalized)) {
      throw new QueryError('analyzeConflicts(): evidence must be summary, standard, or full', {
        code: 'unsupported_target_selector',
        context: { evidence },
      });
    }
    return normalized as EvidenceLevel;
  }

  private static _normalizeMaxPatches(maxPatches: unknown): number | null {
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

  private static _snapshotTarget(selector: Readonly<ConflictTargetSelector> | null): Record<string, unknown> | null {
    if (selector === null) {
      return null;
    }
    const result: Record<string, unknown> = { targetKind: selector.targetKind };
    for (const field of TARGET_SELECTOR_FIELDS) {
      if (selector[field] !== undefined) {
        result[field] = selector[field];
      }
    }
    return result;
  }

  private static _isValidLamportCeiling(lamportCeiling: unknown): lamportCeiling is number {
    return (
      typeof lamportCeiling === 'number' &&
      Number.isInteger(lamportCeiling) &&
      lamportCeiling >= 0
    );
  }

  private static _validateKinds(values: unknown[], kind: ConflictAnalyzeOptions['kind']): void {
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
