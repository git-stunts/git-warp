import { CasError } from '@git-stunts/git-cas';
import { describe, expect, it } from 'vitest';
import AssetSizeMismatchError from '../../../../src/domain/errors/AssetSizeMismatchError.ts';
import GitCasAssetStorageAdapter from '../../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';

async function* source() { yield new Uint8Array([1]); }

function rejectingAdapter(failure: Error) {
  return new GitCasAssetStorageAdapter({ cas: { assets: {
    put: () => Promise.reject(failure), open: () => source(),
  } } });
}

describe('asset staging error boundary', () => {
  it('preserves the original typed size failure through a storage stream wrapper', async () => {
    const original = new AssetSizeMismatchError(2, 3);
    const failure = new CasError('wrapped', 'STREAM_ERROR', { originalError: original });
    await expect(rejectingAdapter(failure).stage(source(), { slug: 'test' })).rejects.toBe(original);
  });

  it('preserves ordinary producer error identity rather than nesting wrappers', async () => {
    const original = new Error('producer rejected');
    const failure = new CasError('wrapped', 'STREAM_ERROR', { originalError: original });
    await expect(rejectingAdapter(failure).stage(source(), { slug: 'test' })).rejects.toBe(original);
  });

  it('does not reinterpret unrelated storage errors with similar metadata', async () => {
    const failure = new CasError('write failure', 'WRITE_ERROR', { originalError: new Error('unrelated') });
    await expect(rejectingAdapter(failure).stage(source(), { slug: 'test' })).rejects.toBe(failure);
  });

  it.each([undefined, null, 'not an Error'])('retains a stream wrapper without an Error original (%s)', async (originalError) => {
    const failure = new CasError('wrapped', 'STREAM_ERROR', { originalError });
    await expect(rejectingAdapter(failure).stage(source(), { slug: 'test' })).rejects.toBe(failure);
  });

  it('does not reinterpret arbitrary errors based on their text', async () => {
    const failure = new Error('Stream error during store');
    await expect(rejectingAdapter(failure).stage(source(), { slug: 'test' })).rejects.toBe(failure);
  });
});
