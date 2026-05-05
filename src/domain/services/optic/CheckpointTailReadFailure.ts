import QueryError from '../../errors/QueryError.ts';
import OpticReadFailureCause from './OpticReadFailureCause.ts';
import OpticReadFailureContext from './OpticReadFailureContext.ts';
import OpticReadTarget, { type OpticKindValue } from './OpticReadTarget.ts';

const REASON_CONTEXT_FIELD = 'reason';

type CheckpointTailReadFailureOptions =
  | {
    readonly graphName: string;
    readonly opticKind: 'node';
    readonly nodeId: string;
  }
  | {
    readonly graphName: string;
    readonly opticKind: 'node-property';
    readonly nodeId: string;
    readonly propertyKey: string;
  };

export default class CheckpointTailReadFailure {
  private readonly _graphName: string;
  private readonly _target: OpticReadTarget;

  constructor(options: CheckpointTailReadFailureOptions) {
    this._graphName = options.graphName;
    this._target = createTarget(options);
    Object.freeze(this);
  }

  enrich(error: QueryError): QueryError {
    const cause = causeForOpticReadError(error);
    if (cause === null) {
      return error;
    }

    return new QueryError(error.message, {
      code: error.code,
      context: new OpticReadFailureContext({
        sourceContext: error.context,
        graphName: this._graphName,
        target: this._target,
        cause,
        includeReason: hasReason(error),
      }).toQueryErrorContext(),
    });
  }
}

function createTarget(options: {
  readonly opticKind: OpticKindValue;
  readonly nodeId: string;
  readonly propertyKey?: string;
}): OpticReadTarget {
  if (options.opticKind === 'node') {
    return OpticReadTarget.node(options.nodeId);
  }
  return OpticReadTarget.nodeProperty(options.nodeId, options.propertyKey ?? '');
}

function causeForOpticReadError(error: QueryError): OpticReadFailureCause | null {
  const reason = reasonForError(error);
  if (reason !== null && reason.length > 0) {
    return new OpticReadFailureCause(reason);
  }
  if (error.code === 'E_OPTIC_TAIL_BUDGET_EXCEEDED') {
    return new OpticReadFailureCause('tail-budget-exceeded');
  }
  if (error.code === 'E_OPTIC_READ_IDENTITY') {
    return new OpticReadFailureCause('read-identity-missing-field');
  }
  return null;
}

function hasReason(error: QueryError): boolean {
  return reasonForError(error) !== null;
}

function reasonForError(error: QueryError): string | null {
  const reason = error.context[REASON_CONTEXT_FIELD];
  return typeof reason === 'string' ? reason : null;
}
