import { describe, expect, it } from 'vitest';
import StreamingBitmapIndexBuilder from '../../../../src/domain/services/index/StreamingBitmapIndexBuilder.ts';
import MockStreamingIndexStorage from '../../../helpers/MockStreamingIndexStorage.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';

describe('StreamingBitmapIndexBuilder chunked finalize', () => {
  it('writes flushed shard chunks through streaming storage and never reads them back during finalize', async () => {
    const storage = new MockStreamingIndexStorage();
    const builder = new StreamingBitmapIndexBuilder({
      storage,
      codec: defaultCodec,
      maxMemoryBytes: 1,
    });

    await builder.addEdge('aa0001', 'bb0001');
    await builder.addEdge('aa0002', 'bb0002');
    await builder.finalize();

    expect(storage.writeBlobStream).toHaveBeenCalled();
    expect(storage.readBlobStream).not.toHaveBeenCalled();

    const entries = storage.writeTree.mock.calls[0]?.[0];
    expect(entries).toBeDefined();
    const safeEntries = entries ?? [];
    expect(safeEntries.some((entry: string) => entry.includes('shards_fwd_aa.chunk-000000.cbor'))).toBe(true);
    expect(safeEntries.some((entry: string) => entry.includes('shards_rev_bb.chunk-000000.cbor'))).toBe(true);
  });
});
