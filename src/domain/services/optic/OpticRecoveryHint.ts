import OpticReadFailureSchemaError from './OpticReadFailureSchemaError.ts';

export type OpticRecoveryOperation =
  | 'plumber.checkpoint.createIndexedBasis'
  | 'plumber.checkpoint.prewarmIndex'
  | 'plumber.optic.retryWithExtendedBudget';

export type OpticRecoveryHintContext = {
  readonly operation: OpticRecoveryOperation;
  readonly retryMaySucceedAfterRecovery: boolean;
  readonly requiresCallerConsent: boolean;
};

export default class OpticRecoveryHint {
  private readonly operation: OpticRecoveryOperation;

  private constructor(operation: string) {
    if (!isOpticRecoveryOperation(operation)) {
      throw new OpticReadFailureSchemaError('unsupported optic recovery operation', { operation });
    }

    this.operation = operation;
    Object.freeze(this);
  }

  static createIndexedBasis(): OpticRecoveryHint {
    return new OpticRecoveryHint('plumber.checkpoint.createIndexedBasis');
  }

  static prewarmIndex(): OpticRecoveryHint {
    return new OpticRecoveryHint('plumber.checkpoint.prewarmIndex');
  }

  static retryWithExtendedBudget(): OpticRecoveryHint {
    return new OpticRecoveryHint('plumber.optic.retryWithExtendedBudget');
  }

  toContextValue(): OpticRecoveryHintContext {
    return Object.freeze({
      operation: this.operation,
      retryMaySucceedAfterRecovery: true,
      requiresCallerConsent: true,
    });
  }
}

function isOpticRecoveryOperation(value: string): value is OpticRecoveryOperation {
  return value === 'plumber.checkpoint.createIndexedBasis'
    || value === 'plumber.checkpoint.prewarmIndex'
    || value === 'plumber.optic.retryWithExtendedBudget';
}
