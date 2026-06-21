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
      'OperationAbortedError',
      'OperationPolicyExhaustedError',
      'OperationPolicyTimeoutError',
      'PatchError',
      'QueryError',
      'SchemaUnsupportedError',
      'ShardCorruptionError',
      'ShardIdOverflowError',
      'ShardLoadError',
      'ShardValidationError',
      'StorageError',
      'StrandError',
      'SyncError',
      'TraversalError',
      'WormholeError',
    ]);
  });
});
