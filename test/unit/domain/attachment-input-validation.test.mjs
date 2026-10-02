import { describe, expect, it, vi } from 'vitest';
import { storeContentAttachmentPayload } from '../../../src/domain/services/PatchBuilderContent.ts';
import AssetStreamConsumption from '../../../src/domain/storage/AssetStreamConsumption.ts';
import { normalizeToAsyncIterable } from '../../../src/domain/utils/streamUtils.ts';

describe('attachment input validation', () => {
  it.each([null, undefined, 123, {}, new ArrayBuffer(4)])('refuses invalid inputs before storage: %s', async (content) => {
    const stage = vi.fn();
    await expect(storeContentAttachmentPayload({ assetStorage: { stage }, content, metadata: undefined, slug: 'test' }))
      .rejects.toMatchObject({ code: 'E_CONTENT_INPUT_INVALID' });
    expect(stage).not.toHaveBeenCalled();
    expect(() => normalizeToAsyncIterable(content)).toThrow(expect.objectContaining({ code: 'E_CONTENT_INPUT_INVALID' }));
  });

  it.each([null, new ArrayBuffer(4), { byteLength: 4 }])('rejects malformed chunks and finalizes producers: %s', async (chunk) => {
    for (const expected of [undefined, 4]) {
      let finalized = false;
      async function* source() {
        try { yield chunk; } finally { finalized = true; }
      }
      const iterator = new AssetStreamConsumption(expected).stream(source())[Symbol.asyncIterator]();
      await expect(iterator.next()).rejects.toMatchObject({ code: 'E_ASSET_CHUNK_INVALID' });
      expect(finalized).toBe(true);
    }
  });
});
