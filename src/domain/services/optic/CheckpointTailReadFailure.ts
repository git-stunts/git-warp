import QueryError from '../../errors/QueryError.ts';

const CREATE_INDEXED_BASIS_OPERATION = 'plumber.checkpoint.createIndexedBasis';
const PREWARM_INDEX_OPERATION = 'plumber.checkpoint.prewarmIndex';
const RETRY_WITH_EXTENDED_BUDGET_OPERATION = 'plumber.optic.retryWithExtendedBudget';
const REASON_CONTEXT_FIELD = 'reason';
const CREATE_INDEXED_BASIS_CAUSES = Object.freeze([
  'missing-checkpoint',
  'checkpoint-without-index-tree',
  'checkpoint-missing-index-shards',
  'checkpoint-shard-invalid',
  'tail-node-remove-needs-raw-liveness-witnesses',
  'tail-property-value-needs-parser',
]);

type OpticKind = 'node' | 'node-property';

type OpticRecoveryHint = {
  readonly operation: string;
  readonly retryMaySucceedAfterRecovery: boolean;
  readonly requiresCallerConsent: boolean;
};

export default class CheckpointTailReadFailure {
  private readonly _graphName: string;
  private readonly _opticKind: OpticKind;
  private readonly _nodeId: string;
  private readonly _propertyKey: string | null;

  constructor(options: {
    readonly graphName: string;
    readonly opticKind: OpticKind;
    readonly nodeId: string;
    readonly propertyKey?: string;
  }) {
    this._graphName = options.graphName;
    this._opticKind = options.opticKind;
    this._nodeId = options.nodeId;
    this._propertyKey = options.propertyKey ?? null;
    Object.freeze(this);
  }

  enrich(error: QueryError): QueryError {
    const cause = causeForOpticReadError(error);
    if (cause === null) {
      return error;
    }

    return new QueryError(error.message, {
      code: error.code,
      context: this._context(error, cause),
    });
  }

  private _context(error: QueryError, cause: string) {
    const common = {
      ...error.context,
      graphName: this._graphName,
      opticKind: this._opticKind,
      target: this._target(),
      cause,
      recoveryHints: recoveryHintsForCause(cause),
    };
    return hasReason(error) ? { ...common, reason: cause } : common;
  }

  private _target(): object {
    if (this._propertyKey === null) {
      return Object.freeze({ nodeId: this._nodeId });
    }
    return Object.freeze({ nodeId: this._nodeId, propertyKey: this._propertyKey });
  }
}

function causeForOpticReadError(error: QueryError): string | null {
  const reason = reasonForError(error);
  if (reason !== null && reason.length > 0) {
    return normalizeCause(reason);
  }
  if (error.code === 'E_OPTIC_TAIL_BUDGET_EXCEEDED') {
    return 'tail-budget-exceeded';
  }
  if (error.code === 'E_OPTIC_READ_IDENTITY') {
    return 'read-identity-missing-field';
  }
  return null;
}

function normalizeCause(reason: string): string {
  if (reason === 'empty-checkpoint-payload-pointer') {
    return 'checkpoint-payload-pointer-empty';
  }
  return reason;
}

function hasReason(error: QueryError): boolean {
  return reasonForError(error) !== null;
}

function reasonForError(error: QueryError): string | null {
  const reason = error.context[REASON_CONTEXT_FIELD];
  return typeof reason === 'string' ? reason : null;
}

function recoveryHintsForCause(cause: string): readonly OpticRecoveryHint[] {
  if (cause === 'tail-budget-exceeded') {
    return Object.freeze([
      recoveryHint(CREATE_INDEXED_BASIS_OPERATION),
      recoveryHint(RETRY_WITH_EXTENDED_BUDGET_OPERATION),
    ]);
  }
  if (cause === 'checkpoint-payload-pointer-without-storage'
    || cause === 'checkpoint-shard-unavailable') {
    return Object.freeze([recoveryHint(PREWARM_INDEX_OPERATION)]);
  }
  if (canCreateIndexedBasisRecover(cause)) {
    return Object.freeze([recoveryHint(CREATE_INDEXED_BASIS_OPERATION)]);
  }
  return Object.freeze([]);
}

function canCreateIndexedBasisRecover(cause: string): boolean {
  return CREATE_INDEXED_BASIS_CAUSES.includes(cause);
}

function recoveryHint(operation: string): OpticRecoveryHint {
  return Object.freeze({
    operation,
    retryMaySucceedAfterRecovery: true,
    requiresCallerConsent: true,
  });
}
