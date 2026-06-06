import OpticRecoveryHint from './OpticRecoveryHint.ts';
import OpticReadFailureSchemaError from './OpticReadFailureSchemaError.ts';

export type OpticReadFailureCauseValue =
  | 'missing-optic-source'
  | 'unsupported-worldline-selector'
  | 'missing-checkpoint'
  | 'checkpoint-without-index-tree'
  | 'checkpoint-missing-index-shards'
  | 'checkpoint-payload-pointer-without-storage'
  | 'checkpoint-payload-pointer-empty'
  | 'checkpoint-shard-unavailable'
  | 'checkpoint-shard-invalid'
  | 'tail-node-remove-needs-raw-liveness-witnesses'
  | 'tail-property-value-needs-parser'
  | 'tail-neighborhood-needs-adjacency-witnesses'
  | 'requires-global-scan'
  | 'tail-budget-exceeded'
  | 'read-identity-missing-field'
  | 'read-identity-evidence-unavailable'
  | 'read-identity-invalid-frontier'
  | 'read-identity-invalid-tail-witness';

const OPTIC_READ_FAILURE_CAUSES: readonly string[] = Object.freeze([
  'missing-optic-source',
  'unsupported-worldline-selector',
  'missing-checkpoint',
  'checkpoint-without-index-tree',
  'checkpoint-missing-index-shards',
  'checkpoint-payload-pointer-without-storage',
  'checkpoint-payload-pointer-empty',
  'checkpoint-shard-unavailable',
  'checkpoint-shard-invalid',
  'tail-node-remove-needs-raw-liveness-witnesses',
  'tail-property-value-needs-parser',
  'tail-neighborhood-needs-adjacency-witnesses',
  'requires-global-scan',
  'tail-budget-exceeded',
  'read-identity-missing-field',
  'read-identity-evidence-unavailable',
  'read-identity-invalid-frontier',
  'read-identity-invalid-tail-witness',
]);

const CREATE_INDEXED_BASIS_CAUSES: readonly OpticReadFailureCauseValue[] = Object.freeze([
  'missing-checkpoint',
  'checkpoint-without-index-tree',
  'checkpoint-missing-index-shards',
  'checkpoint-shard-invalid',
  'tail-node-remove-needs-raw-liveness-witnesses',
  'tail-property-value-needs-parser',
  'tail-neighborhood-needs-adjacency-witnesses',
]);

export default class OpticReadFailureCause {
  readonly value: OpticReadFailureCauseValue;

  constructor(value: string) {
    const normalized = normalizeLegacyReason(value);
    if (!isOpticReadFailureCauseValue(normalized)) {
      throw new OpticReadFailureSchemaError('unsupported optic read failure cause', { cause: normalized });
    }

    this.value = normalized;
    Object.freeze(this);
  }

  recoveryHints(): readonly OpticRecoveryHint[] {
    if (this.value === 'tail-budget-exceeded') {
      return Object.freeze([
        OpticRecoveryHint.createIndexedBasis(),
        OpticRecoveryHint.retryWithExtendedBudget(),
      ]);
    }
    if (this.value === 'checkpoint-payload-pointer-without-storage'
      || this.value === 'checkpoint-shard-unavailable') {
      return Object.freeze([OpticRecoveryHint.prewarmIndex()]);
    }
    if (canCreateIndexedBasisRecover(this.value)) {
      return Object.freeze([OpticRecoveryHint.createIndexedBasis()]);
    }
    return Object.freeze([]);
  }
}

function normalizeLegacyReason(value: string): string {
  if (value === 'empty-checkpoint-payload-pointer') {
    return 'checkpoint-payload-pointer-empty';
  }
  return value;
}

function canCreateIndexedBasisRecover(value: OpticReadFailureCauseValue): boolean {
  return CREATE_INDEXED_BASIS_CAUSES.includes(value);
}

function isOpticReadFailureCauseValue(value: string): value is OpticReadFailureCauseValue {
  return OPTIC_READ_FAILURE_CAUSES.includes(value);
}
