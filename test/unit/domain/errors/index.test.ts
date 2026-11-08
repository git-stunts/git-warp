import { describe, it, expect } from 'vitest';

describe('domain/errors index barrel', () => {
  it('re-exports the full error surface', async () => {
    const errors = await import('../../../../src/domain/errors/index.ts');

    expect(Object.keys(errors).sort()).toEqual([
      'AuditError',
      'ContinuumArtifactAuthorityError',
      'EncryptionError',
      'ForkError',
      'IndexError',
      'MemoryBudgetError',
      'ObserverIdentityError',
      'OperationAbortedError',
      'OperationPolicyExhaustedError',
      'OperationPolicyTimeoutError',
      'OpticError',
      'PatchError',
      'PurposeError',
      'QueryError',
      'ReadBudgetError',
      'SchemaUnsupportedError',
      'ShardCorruptionError',
      'ShardIdOverflowError',
      'ShardLoadError',
      'ShardValidationError',
      'StorageError',
      'StrandError',
      'SyncError',
      'TraversalError',
      'WarpReadGrantError',
      'WarpReadRequestError',
      'WormholeError',
    ]);
  });
});
