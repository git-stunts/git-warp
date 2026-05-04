import { describe, expect, it } from 'vitest';
import OpticReadFailureCause from '../../../../../src/domain/services/optic/OpticReadFailureCause.ts';
import OpticReadFailureContext from '../../../../../src/domain/services/optic/OpticReadFailureContext.ts';
import OpticReadFailureSchemaError from '../../../../../src/domain/services/optic/OpticReadFailureSchemaError.ts';
import OpticReadTarget from '../../../../../src/domain/services/optic/OpticReadTarget.ts';

describe('OpticReadFailureContext', () => {
  it('builds the stable no-bounded-basis context shape for node reads', () => {
    const context = new OpticReadFailureContext({
      sourceContext: { reason: 'checkpoint-missing-index-shards' },
      graphName: 'schema-graph',
      target: OpticReadTarget.node('node:1'),
      cause: new OpticReadFailureCause('checkpoint-missing-index-shards'),
      includeReason: true,
    }).toQueryErrorContext();

    expect(context).toEqual({
      reason: 'checkpoint-missing-index-shards',
      graphName: 'schema-graph',
      opticKind: 'node',
      target: { nodeId: 'node:1' },
      cause: 'checkpoint-missing-index-shards',
      recoveryHints: [
        {
          operation: 'plumber.checkpoint.createIndexedBasis',
          retryMaySucceedAfterRecovery: true,
          requiresCallerConsent: true,
        },
      ],
    });
  });

  it('builds node property targets without changing code-specific context fields', () => {
    const context = new OpticReadFailureContext({
      sourceContext: {
        budgetKind: 'maxTailPatches',
        budgetLimit: 10_000,
        budgetObserved: 10_001,
        budgetUnit: 'patch',
      },
      graphName: 'budget-graph',
      target: OpticReadTarget.nodeProperty('node:1', 'title'),
      cause: new OpticReadFailureCause('tail-budget-exceeded'),
      includeReason: false,
    }).toQueryErrorContext();

    expect(context).toEqual({
      budgetKind: 'maxTailPatches',
      budgetLimit: 10_000,
      budgetObserved: 10_001,
      budgetUnit: 'patch',
      graphName: 'budget-graph',
      opticKind: 'node-property',
      target: { nodeId: 'node:1', propertyKey: 'title' },
      cause: 'tail-budget-exceeded',
      recoveryHints: [
        {
          operation: 'plumber.checkpoint.createIndexedBasis',
          retryMaySucceedAfterRecovery: true,
          requiresCallerConsent: true,
        },
        {
          operation: 'plumber.optic.retryWithExtendedBudget',
          retryMaySucceedAfterRecovery: true,
          requiresCallerConsent: true,
        },
      ],
    });
  });

  it('normalizes the legacy empty checkpoint payload pointer reason', () => {
    const context = new OpticReadFailureContext({
      sourceContext: { reason: 'empty-checkpoint-payload-pointer' },
      graphName: 'payload-graph',
      target: OpticReadTarget.node('node:payload'),
      cause: new OpticReadFailureCause('empty-checkpoint-payload-pointer'),
      includeReason: true,
    }).toQueryErrorContext();

    expect(context).toMatchObject({
      cause: 'checkpoint-payload-pointer-empty',
      reason: 'checkpoint-payload-pointer-empty',
      recoveryHints: [],
    });
  });

  it('rejects unsupported cause identifiers', () => {
    expect(() => new OpticReadFailureCause('surprise-string')).toThrow(OpticReadFailureSchemaError);
  });

  it('rejects incomplete node property targets', () => {
    expect(() => OpticReadTarget.nodeProperty('node:1', '')).toThrow(OpticReadFailureSchemaError);
  });
});
