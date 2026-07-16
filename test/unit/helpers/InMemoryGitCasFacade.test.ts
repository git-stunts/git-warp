import { describe, expect, it } from 'vitest';
import InMemoryBlobStorageAdapter from '../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../helpers/InMemoryGraphAdapter.ts';

describe('InMemoryGitCasFacade page handles', () => {
  it.each([
    ['sha1', 40],
    ['sha256', 64],
  ])('derives %s metadata from the history OID width', async (hashAlgorithm, oidLength) => {
    const oid = 'a'.repeat(oidLength);
    const cas = new InMemoryGitCasFacade({
      history: new InMemoryGraphAdapter({ hash: () => oid }),
      storage: new InMemoryBlobStorageAdapter(),
    });

    const page = await cas.pages.put({ source: new Uint8Array([1]) });

    expect(page.handle.oid).toBe(oid);
    expect(page.handle.hashAlgorithm).toBe(hashAlgorithm);
  });
});
