import { expect } from 'vitest';
import {
  CREATE_INDEXED_BASIS_HINT,
  PREWARM_INDEX_HINT,
  RETRY_WITH_EXTENDED_BUDGET_HINT,
  TAIL_BUDGET_LIMIT,
  TAIL_BUDGET_OBSERVED,
  type ExpectedRecoveryHint,
} from './V17CheckpointTailOpticFixtureData.ts';

export default class V17OpticFailureExpectations {
  constructor() {
    Object.freeze(this);
  }

  expectReadIdentity(result: object): void {
    expect(result).toHaveProperty('readIdentity');
    expect(result).not.toHaveProperty('stateHash');
  }

  expectTailWitnessCount(result: object, count: number): void {
    const readIdentity = Reflect.get(result, 'readIdentity');
    expect(Reflect.get(readIdentity, 'tailWitnesses')).toHaveLength(count);
  }

  expectNoBoundedBasisFailure(options: {
    readonly read: Promise<object>;
    readonly graphName: string;
    readonly opticKind: 'node' | 'node-property';
    readonly target: object;
    readonly cause: string;
    readonly recoveryHints?: readonly ExpectedRecoveryHint[];
  }): Promise<void> {
    return expect(options.read)
      .rejects
      .toMatchObject({
        code: 'E_OPTIC_NO_BOUNDED_BASIS',
        context: {
          graphName: options.graphName,
          opticKind: options.opticKind,
          target: options.target,
          cause: options.cause,
          reason: options.cause,
          recoveryHints: options.recoveryHints ?? [CREATE_INDEXED_BASIS_HINT],
        },
      });
  }

  expectShardUnavailableFailure(options: {
    readonly read: Promise<object>;
    readonly graphName: string;
    readonly opticKind: 'node' | 'node-property';
    readonly target: object;
  }): Promise<void> {
    return this.expectNoBoundedBasisFailure({
      ...options,
      cause: 'checkpoint-shard-unavailable',
      recoveryHints: [PREWARM_INDEX_HINT],
    });
  }

  expectTailBudgetExceededFailure(options: {
    readonly read: Promise<object>;
    readonly graphName: string;
    readonly opticKind: 'node' | 'node-property';
    readonly target: object;
  }): Promise<void> {
    return expect(options.read)
      .rejects
      .toMatchObject({
        code: 'E_OPTIC_TAIL_BUDGET_EXCEEDED',
        context: {
          graphName: options.graphName,
          opticKind: options.opticKind,
          target: options.target,
          cause: 'tail-budget-exceeded',
          recoveryHints: [CREATE_INDEXED_BASIS_HINT, RETRY_WITH_EXTENDED_BUDGET_HINT],
          budgetKind: 'maxTailPatches',
          budgetLimit: TAIL_BUDGET_LIMIT,
          budgetObserved: TAIL_BUDGET_OBSERVED,
          budgetUnit: 'patch',
        },
      });
  }
}
