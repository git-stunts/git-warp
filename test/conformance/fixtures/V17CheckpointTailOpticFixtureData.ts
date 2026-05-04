export const TAIL_BUDGET_LIMIT = 10_000;
export const TAIL_BUDGET_OBSERVED = TAIL_BUDGET_LIMIT + 1;

export const MISSING_NODE_ID = 'node:missing';
export const CHECKPOINT_NODE_ID = 'node:checkpoint-basis';
export const PROPERTY_KEY = 'title';
export const CHECKPOINT_PROPERTY_VALUE = 'checkpoint title';
export const TAIL_PROPERTY_VALUE = 'tail title';
export const UNSUPPORTED_TAIL_PROPERTY_VALUE = Object.freeze({ nested: TAIL_PROPERTY_VALUE });

export type ExpectedRecoveryHint = {
  readonly operation: string;
  readonly retryMaySucceedAfterRecovery: boolean;
  readonly requiresCallerConsent: boolean;
};

export const CREATE_INDEXED_BASIS_HINT = Object.freeze({
  operation: 'plumber.checkpoint.createIndexedBasis',
  retryMaySucceedAfterRecovery: true,
  requiresCallerConsent: true,
});

export const RETRY_WITH_EXTENDED_BUDGET_HINT = Object.freeze({
  operation: 'plumber.optic.retryWithExtendedBudget',
  retryMaySucceedAfterRecovery: true,
  requiresCallerConsent: true,
});

export const PREWARM_INDEX_HINT = Object.freeze({
  operation: 'plumber.checkpoint.prewarmIndex',
  retryMaySucceedAfterRecovery: true,
  requiresCallerConsent: true,
});
