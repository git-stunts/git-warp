import { describe, expect, it } from 'vitest';
import AssetHandle from '../../../../src/domain/storage/AssetHandle.ts';
import { collectAsyncIterable } from '../../../../src/domain/utils/streamUtils.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';

async function* chunks(...values: string[]): AsyncGenerator<Uint8Array> {
  const encoder = new TextEncoder();
  for (const value of values) {
    yield encoder.encode(value);
  }
}

describe('InMemoryBlobStorageAdapter asset semantics', () => {
  it('stages a streaming asset behind an opaque handle', async () => {
    const storage = new InMemoryBlobStorageAdapter();

    const staged = await storage.stage(chunks('hello', ' ', 'world'), {
      slug: 'greeting',
      filename: 'greeting.txt',
      expectedSize: 11,
    });

    expect(staged.handle).toBeInstanceOf(AssetHandle);
    expect(staged.size).toBe(11);
    expect(staged.retention).toEqual({
      reachability: 'unanchored',
      protection: 'not-established',
    });
    await expect(collectAsyncIterable(storage.open(staged.handle)))
      .resolves.toEqual(new TextEncoder().encode('hello world'));
  });

  it('deduplicates identical bytes to the same immutable handle', async () => {
    const storage = new InMemoryBlobStorageAdapter();

    const first = await storage.stage(chunks('same'), { slug: 'first' });
    const second = await storage.stage(chunks('same'), { slug: 'second' });

    expect(second.handle.equals(first.handle)).toBe(true);
  });

  it('rejects unknown handles when the stream is consumed', async () => {
    const storage = new InMemoryBlobStorageAdapter();

    await expect(collectAsyncIterable(storage.open(new AssetHandle('missing'))))
      .rejects.toThrow(/unknown asset/);
    await expect(collectAsyncIterable(storage.retrieveStream('missing')))
      .rejects.toThrow(/unknown asset/);
  });

  it('rejects content whose staged size differs from its declaration', async () => {
    const storage = new InMemoryBlobStorageAdapter();

    await expect(storage.stage(chunks('four'), {
      slug: 'mismatch',
      expectedSize: 5,
    })).rejects.toMatchObject({
      code: 'E_ASSET_SIZE_MISMATCH',
      expectedSize: 5,
      actualSize: 4,
    });
  });
});
