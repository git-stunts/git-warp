import { describe, expect, it } from 'vitest';
import GitCasAssetStorageAdapter from '../../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

function fixture() {
  const history = new InMemoryGraphAdapter();
  const storage = new InMemoryBlobStorageAdapter();
  const cas = new InMemoryGitCasFacade({ history, storage });
  const accepted: number[] = [];
  let calls = 0;
  const adapter = new GitCasAssetStorageAdapter({ cas: {
    assets: {
      put: async (options) => {
        calls += 1;
        const source = options.source;
        return await cas.assets.put({ ...options, source: (async function* () {
          for await (const chunk of source) {
            accepted.push(chunk.byteLength);
            yield chunk;
          }
        })() });
      },
      open: cas.assets.open,
    },
  } });
  return { adapter, accepted, calls: () => calls };
}

it('rejects overflow before passing the excess chunk to storage and closes the producer', async () => {
  const { adapter, accepted } = fixture();
  let closed = false;
  let reachedTail = false;
  async function* source() {
    try {
      yield new Uint8Array(2);
      yield new Uint8Array(2);
      reachedTail = true;
      yield new Uint8Array(1024);
    } finally {
      closed = true;
    }
  }
  await expect(adapter.stage(source(), { slug: 'overflow', expectedSize: 3 }))
    .rejects.toMatchObject({ code: 'E_ASSET_SIZE_MISMATCH', expectedSize: 3, actualSize: 4 });
  expect(accepted).toEqual([2]);
  expect(reachedTail).toBe(false);
  expect(closed).toBe(true);
});

it('detects truncation before storage can return a successful staged asset', async () => {
  const { adapter } = fixture();
  async function* source() { yield new Uint8Array(2); }
  await expect(adapter.stage(source(), { slug: 'truncated', expectedSize: 3 }))
    .rejects.toMatchObject({ code: 'E_ASSET_SIZE_MISMATCH', expectedSize: 3, actualSize: 2 });
});

describe.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
  'invalid declared size %s', (expectedSize) => {
    it('refuses the declaration before starting storage or consuming the source', async () => {
      const { adapter, calls } = fixture();
      let consumed = false;
      async function* source() { consumed = true; yield new Uint8Array(1); }
      await expect(adapter.stage(source(), { slug: 'invalid-size', expectedSize }))
        .rejects.toMatchObject({ code: 'E_ASSET_SIZE_INVALID' });
      expect(calls()).toBe(0);
      expect(consumed).toBe(false);
    });
  }
);

it.each([0, 4])('accepts exactly %s bytes', async (expectedSize) => {
  const { adapter } = fixture();
  async function* source() { yield new Uint8Array(expectedSize); }
  await expect(adapter.stage(source(), { slug: 'exact', expectedSize }))
    .resolves.toMatchObject({ size: expectedSize });
});
