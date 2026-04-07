import { describe, it, expect } from 'vitest';

describe('domain/errors index barrel', () => {
  it('re-exports the full error surface', async () => {
    const errors = await import('../../../../src/domain/errors/index.js');

    expect(Object.keys(errors).sort()).toEqual([
      'AdapterValidationError',
      'AuditError',
      'CacheError',
      'CrdtError',
      'CryptoError',
      'EmptyMessageError',
      'EncryptionError',
      'ForkError',
      'IndexError',
      'MessageCodecError',
      'OperationAbortedError',
      'PatchError',
      'PersistenceError',
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
      'TrustError',
      'WarpError',
      'WormholeError',
      'WriterError',
    ]);
  });
});
