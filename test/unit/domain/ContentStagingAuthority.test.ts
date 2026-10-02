import { describe, expect, it, vi } from 'vitest';
import StagedContent from '../../../src/domain/api/StagedContent.ts';
import ContentStagingAuthority from '../../../src/domain/services/ContentStagingAuthority.ts';
import AssetHandle from '../../../src/domain/storage/AssetHandle.ts';
import AssetStreamConsumption from '../../../src/domain/storage/AssetStreamConsumption.ts';
import type AssetStoragePort from '../../../src/ports/AssetStoragePort.ts';
import type { AssetWriteOptions, StagedAsset } from '../../../src/ports/AssetStoragePort.ts';

function storage() {
  const stage = vi.fn(async (source: AsyncIterable<Uint8Array>, options: AssetWriteOptions) => {
    const consumption = new AssetStreamConsumption(options.expectedSize);
    for await (const _chunk of consumption.stream(source)) { /* Consume before issuing metadata. */ }
    const receipt: StagedAsset = {
      handle: new AssetHandle('content:stored'), size: consumption.size, observedAt: 'staged',
      retention: { reachability: 'unanchored', protection: 'not-established' },
    };
    return receipt;
  });
  const port: AssetStoragePort = { stage, open: () => bytes() };
  return { port, stage };
}

async function* bytes() { yield new Uint8Array([1, 2, 3]); }

function options(assetStorage: AssetStoragePort | null) {
  return { assetStorage, slug: 'lane/staging', content: bytes(), metadata: undefined };
}

describe('ContentStagingAuthority', () => {
  it('issues immutable metadata only after storage consumes the source', async () => {
    const authority = new ContentStagingAuthority();
    const { port, stage } = storage();
    const content = await authority.stage({ ...options(port), metadata: { mime: 'text/plain', size: 3 } });
    expect(content).toEqual({ id: 'content:stored', mime: 'text/plain', size: 3 });
    expect(Object.isFrozen(content)).toBe(true);
    expect(stage).toHaveBeenCalledOnce();
    const payload = authority.requirePayload(content);
    expect(payload.handle.toString()).toBe(content.id);
    expect(payload.mime?.toString()).toBe(content.mime);
    expect(payload.size?.toNumber()).toBe(content.size);
  });

  it('supports absent MIME and repeated use of one authentic staged value', async () => {
    const authority = new ContentStagingAuthority();
    const content = await authority.stage(options(storage().port));
    expect(content.mime).toBeNull();
    expect(authority.requirePayload(content)).toBe(authority.requirePayload(content));
  });

  it('refuses a copied value with identical metadata', async () => {
    const authority = new ContentStagingAuthority();
    const content = await authority.stage(options(storage().port));
    expect(() => authority.requirePayload(new StagedContent(content)))
      .toThrow(expect.objectContaining({ code: 'E_CONTENT_FOREIGN' }));
  });

  it('refuses content staged by another authority even with identical storage', async () => {
    const first = new ContentStagingAuthority();
    const second = new ContentStagingAuthority();
    const { port } = storage();
    const content = await first.stage(options(port));
    expect(() => second.requirePayload(content))
      .toThrow(expect.objectContaining({ code: 'E_CONTENT_FOREIGN' }));
  });

  it('refuses a fabricated value without staging', () => {
    const content = new StagedContent({ id: 'content:stored', mime: null, size: 3 });
    expect(() => new ContentStagingAuthority().requirePayload(content))
      .toThrow(expect.objectContaining({ code: 'E_CONTENT_FOREIGN' }));
  });

  it('rejects missing storage before requesting any producer bytes', async () => {
    const next = vi.fn();
    const content: AsyncIterable<Uint8Array> = { [Symbol.asyncIterator]: () => ({ next }) };
    await expect(new ContentStagingAuthority().stage({ ...options(null), content }))
      .rejects.toMatchObject({ code: 'NO_ASSET_STORAGE' });
    expect(next).not.toHaveBeenCalled();
  });

  it('preserves staging failures rather than manufacturing a usable value', async () => {
    const failure = new Error('staging refused');
    const { port, stage } = storage();
    stage.mockRejectedValueOnce(failure);
    await expect(new ContentStagingAuthority().stage(options(port))).rejects.toBe(failure);
  });

  it('does not convert a declared-size mismatch into a successful staging result', async () => {
    await expect(new ContentStagingAuthority().stage({ ...options(storage().port), metadata: { size: 2 } }))
      .rejects.toMatchObject({ code: 'E_ASSET_SIZE_MISMATCH' });
  });

  it('finalizes a producer that fails partway through staging', async () => {
    const failure = new Error('producer failed');
    const finished = vi.fn();
    async function* source() {
      try { yield new Uint8Array([1]); throw failure; } finally { finished(); }
    }
    await expect(new ContentStagingAuthority().stage({ ...options(storage().port), content: source() }))
      .rejects.toBe(failure);
    expect(finished).toHaveBeenCalledOnce();
  });
});
