import { describe, it, expect, vi } from 'vitest';
import CasFirstMemoizationEngine from '../../src/domain/services/materialize/CasFirstMemoizationEngine.ts';
import type BlobStoragePort from '../../src/ports/BlobStoragePort.ts';
import type CryptoPort from '../../src/ports/CryptoPort.ts';
import type CodecPort from '../../src/ports/CodecPort.ts';

describe('CasFirstMemoizationEngine', () => {
  const dummyCrypto: CryptoPort = {
    hash: vi.fn(async (_algorithm: string, data: string | Uint8Array) => `hash:${data as string}`),
    hmac: vi.fn(),
    timingSafeEqual: vi.fn(),
  };

  const dummyCodec: CodecPort = {
    encode: vi.fn(),
    decode: vi.fn(),
  };

  it('2.1. Is object already in git-cas? (Hit -> bypasses materialization)', async () => {
    const mockBlobStorage: BlobStoragePort = {
      store: vi.fn(),
      retrieve: vi.fn(async () => new Uint8Array([1, 2, 3])),
      storeStream: vi.fn(),
      retrieveStream: vi.fn(),
      has: vi.fn(async () => true),
    };

    const engine = new CasFirstMemoizationEngine({
      blobStorage: mockBlobStorage,
      crypto: dummyCrypto,
      codec: dummyCodec,
    });

    const materializeStream = vi.fn(async function* () {
      yield new Uint8Array([9, 9, 9]);
    });

    const decodeObject = vi.fn((buf: Uint8Array) => ({ data: Array.from(buf) }));

    const result = await engine.materialize({
      coordinateKeyParams: 'frontier-1:optic-lens-abc',
      materializeStream,
      decodeObject,
    });

    expect(mockBlobStorage.has).toHaveBeenCalledWith('hash:frontier-1:optic-lens-abc');
    expect(mockBlobStorage.retrieve).toHaveBeenCalledWith('hash:frontier-1:optic-lens-abc');
    expect(materializeStream).not.toHaveBeenCalled();
    expect(result.hit).toBe(true);
    expect(result.object).toEqual({ data: [1, 2, 3] });
    expect(result.casTreeOid).toBe('hash:frontier-1:optic-lens-abc');
  });

  it('2.2 & 2.3. No? Materialize via streaming and write materialized git-object to git-cas always', async () => {
    const mockBlobStorage: BlobStoragePort = {
      store: vi.fn(),
      retrieve: vi.fn(),
      storeStream: vi.fn(async (source: AsyncIterable<Uint8Array>) => {
        // Consume stream to simulate storage
        let count = 0;
        for await (const _chunk of source) {
          count += 1;
        }
        void count;
        return 'tree-oid-new-123';
      }),
      retrieveStream: vi.fn(),
      has: vi.fn(async () => false),
    };

    const engine = new CasFirstMemoizationEngine({
      blobStorage: mockBlobStorage,
      crypto: dummyCrypto,
      codec: dummyCodec,
    });

    const materializeStream = vi.fn(async function* () {
      yield new Uint8Array([10, 20]);
      yield new Uint8Array([30, 40]);
    });

    const decodeObject = vi.fn((buf: Uint8Array) => ({ data: Array.from(buf) }));

    const result = await engine.materialize({
      coordinateKeyParams: 'frontier-2:optic-lens-xyz',
      materializeStream,
      decodeObject,
    });

    expect(mockBlobStorage.has).toHaveBeenCalledWith('hash:frontier-2:optic-lens-xyz');
    expect(materializeStream).toHaveBeenCalled();
    expect(mockBlobStorage.storeStream).toHaveBeenCalled();
    expect(result.hit).toBe(false);
    expect(result.object).toEqual({ data: [10, 20, 30, 40] });
    expect(result.casTreeOid).toBe('tree-oid-new-123');
  });

  it('handles fallback when has() is not implemented on older BlobStoragePort adapters', async () => {
    const mockBlobStorage: BlobStoragePort = {
      store: vi.fn(),
      retrieve: vi.fn(async () => {
        throw new Error('Not found');
      }),
      storeStream: vi.fn(async (source: AsyncIterable<Uint8Array>) => {
        let count = 0;
        for await (const _chunk of source) {
          count += 1;
        }
        void count;
        return 'tree-oid-fallback';
      }),
      retrieveStream: vi.fn(),
      // has is omitted
    };

    const engine = new CasFirstMemoizationEngine({
      blobStorage: mockBlobStorage,
      crypto: dummyCrypto,
      codec: dummyCodec,
    });

    const materializeStream = vi.fn(async function* () {
      yield new Uint8Array([5, 5]);
    });

    const decodeObject = vi.fn((buf: Uint8Array) => ({ data: Array.from(buf) }));

    const result = await engine.materialize({
      coordinateKeyParams: 'frontier-3:optic-lens-def',
      materializeStream,
      decodeObject,
    });

    expect(materializeStream).toHaveBeenCalled();
    expect(result.hit).toBe(false);
    expect(result.object).toEqual({ data: [5, 5] });
    expect(result.casTreeOid).toBe('tree-oid-fallback');
  });
});
