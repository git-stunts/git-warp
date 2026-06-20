import { describe, expect, it, vi } from 'vitest';

import {
  V17_SUBSTRATE_MIGRATION_COMPATIBILITY_POLICY,
} from '../../../../scripts/migrations/v17.0.0/SubstrateMigrationCompatibilityPolicy.ts';
import { readPayloadBlob } from '../../../../src/infrastructure/adapters/CasPayloadPointer.ts';
import BlobStoragePort from '../../../../src/ports/BlobStoragePort.ts';

class MemoryBlobStorage extends BlobStoragePort {
  override store(_content: Uint8Array | string): Promise<string> {
    return Promise.resolve('storage-oid');
  }

  override retrieve = vi.fn(async (_oid: string): Promise<Uint8Array> => new Uint8Array([9]));

  override storeStream(_source: AsyncIterable<Uint8Array>): Promise<string> {
    return Promise.resolve('storage-oid');
  }

  override async *retrieveStream(_oid: string): AsyncIterable<Uint8Array> {
    yield new Uint8Array([9]);
  }
}

describe('CasPayloadPointer compatibility boundary', () => {
  it('rejects inline payload bytes when CAS blob storage is configured', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const blobPort = { readBlob: vi.fn(async () => bytes) };
    const blobStorage = new MemoryBlobStorage();

    await expect(readPayloadBlob({ blobPort, blobStorage, oid: 'inline-oid' }))
      .rejects.toMatchObject({ code: 'E_LEGACY_SUBSTRATE_DISABLED' });
    expect(blobStorage.retrieve).not.toHaveBeenCalled();
  });

  it('allows inline payload bytes only under migration compatibility policy', async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const blobPort = { readBlob: vi.fn(async () => bytes) };

    await expect(readPayloadBlob({
      blobPort,
      blobStorage: new MemoryBlobStorage(),
      oid: 'inline-oid',
      compatibilityPolicy: V17_SUBSTRATE_MIGRATION_COMPATIBILITY_POLICY,
    })).resolves.toBe(bytes);
  });
});
