import type QueryError from '../../errors/QueryError.ts';
import type OpticReadFailureCause from './OpticReadFailureCause.ts';
import type { OpticRecoveryHintContext } from './OpticRecoveryHint.ts';
import type { OpticReadTargetInstance, OpticTargetContext } from './OpticReadTarget.ts';
import OpticReadFailureSchemaError from './OpticReadFailureSchemaError.ts';

type OpticReadFailureContextOptions = {
  readonly sourceContext: QueryError['context'];
  readonly graphName: string;
  readonly target: OpticReadTargetInstance;
  readonly cause: OpticReadFailureCause;
  readonly includeReason: boolean;
};

type OpticReadFailureContextValue = QueryError['context'] & {
  readonly graphName: string;
  readonly opticKind: string;
  readonly target: OpticTargetContext;
  readonly cause: string;
  readonly recoveryHints: readonly OpticRecoveryHintContext[];
  readonly reason?: string;
};

export default class OpticReadFailureContext {
  private readonly sourceContext: QueryError['context'];
  private readonly graphName: string;
  private readonly target: OpticReadTargetInstance;
  private readonly cause: OpticReadFailureCause;
  private readonly includeReason: boolean;

  constructor(options: OpticReadFailureContextOptions) {
    if (options.graphName.length === 0) {
      throw new OpticReadFailureSchemaError('optic read failure context requires graphName');
    }

    this.sourceContext = Object.freeze({ ...options.sourceContext });
    this.graphName = options.graphName;
    this.target = options.target;
    this.cause = options.cause;
    this.includeReason = options.includeReason;
    Object.freeze(this);
  }

  toQueryErrorContext(): QueryError['context'] {
    const context = {
      ...this.sourceContext,
      graphName: this.graphName,
      opticKind: this.target.opticKind,
      target: this.target.toContextValue(),
      cause: this.cause.value,
      recoveryHints: Object.freeze(
        this.cause.recoveryHints().map((hint) => hint.toContextValue()),
      ),
    };
    if (this.includeReason) {
      return this.freezeContext({ ...context, reason: this.cause.value });
    }
    return this.freezeContext(context);
  }

  private freezeContext(context: OpticReadFailureContextValue): QueryError['context'] {
    return Object.freeze(context);
  }
}
