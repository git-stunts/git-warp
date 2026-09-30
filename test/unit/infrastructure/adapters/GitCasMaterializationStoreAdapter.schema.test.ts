/**
 * A materialization cache entry written by an older runtime is never served.
 *
 * Descriptor schema 6 is the first whose property roots and replay basis
 * apply the node lifecycle visibility rule. An entry an older runtime wrote
 * under descriptor schema 5 holds state built without that rule, so the
 * current runtime must miss it and rebuild rather than reuse it.
 */
import { describe, expect, it } from 'vitest';
import MaterializationCoordinate from '../../../../src/domain/materialization/MaterializationCoordinate.ts';
import MaterializationRoot from '../../../../src/domain/materialization/MaterializationRoot.ts';
import MaterializationRoots from '../../../../src/domain/materialization/MaterializationRoots.ts';
import BundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import GitCasMaterializationCacheKey from '../../../../src/infrastructure/adapters/GitCasMaterializationCacheKey.ts';
import { materializationDescriptorData } from '../../../../src/infrastructure/adapters/GitCasMaterializationDescriptor.ts';
import GitCasMaterializationStoreAdapter from '../../../../src/infrastructure/adapters/GitCasMaterializationStoreAdapter.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

const CACHE_NAMESPACE = 'git-warp/materializations';
const LANE = 'events';

async function nodeAliveOnlyRoots(cas: InMemoryGitCasFacade): Promise<MaterializationRoots> {
  const page = await cas.pages.put({ source: new Uint8Array([1]) });
  const bundle = await cas.bundles.putOrdered({ members: [['root', page.handle]] });
  return new MaterializationRoots({
    adjacency: MaterializationRoot.unavailable(),
    edgeAlive: MaterializationRoot.empty(),
    edgeBirths: MaterializationRoot.unavailable(),
    frontier: MaterializationRoot.unavailable(),
    nodeAlive: MaterializationRoot.retained(new BundleHandle(bundle.handle.toString())),
    properties: MaterializationRoot.empty(),
    provenanceSupport: MaterializationRoot.unavailable(),
    replayBasis: MaterializationRoot.unavailable(),
    roaringIndexes: MaterializationRoot.unavailable(),
  });
}

function requireMember(members: readonly [string, string][], path: string): string {
  const member = members.find(([candidate]) => candidate === path);
  if (member === undefined) {
    throw new Error(`Expected materialization member ${path}`);
  }
  return member[1];
}

describe('materialization cache entries across a descriptor schema bump', () => {
  it.each([5, 6])('does not serve an entry written under descriptor schema %s', async (olderSchema) => {
    const cas = new InMemoryGitCasFacade({ history: new InMemoryGraphAdapter(), storage: new InMemoryBlobStorageAdapter() });
    const crypto = new NodeCryptoAdapter();
    const adapter = new GitCasMaterializationStoreAdapter({ cas, codec: defaultCodec, crypto, laneName: LANE });
    const coordinate = new MaterializationCoordinate({ frontier: new Map([['writer-a', 'patch-a']]), ceiling: 3 });
    const roots = await nodeAliveOnlyRoots(cas);
    const retained = await adapter.retain({ coordinate, roots, stateHash: null });

    // Rewrite the entry as an older runtime left it: a schema 5 descriptor
    // under the schema 5 key for the same lane and coordinate.
    const descriptorPage = requireMember(cas.readBundleMembers(retained.bundle.toString()), 'meta/descriptor');
    cas.replaceStoredPage(descriptorPage, defaultCodec.encode({
      ...materializationDescriptorData({ coordinate, stateHash: null, laneName: LANE, roots }),
      schemaVersion: olderSchema,
    }));
    const cache = await cas.caches.open({ namespace: CACHE_NAMESPACE });
    const [currentKey] = cas.readCacheKeys(CACHE_NAMESPACE);
    const hit = currentKey === undefined ? null : await cache.get(currentKey);
    if (currentKey === undefined || hit === null) {
      throw new Error('Expected the retained materialization in the cache');
    }
    const olderKey = await new GitCasMaterializationCacheKey({ codec: defaultCodec, crypto, laneName: LANE })
      .forCoordinate(coordinate, olderSchema);
    await cache.remove(currentKey);
    await cache.put(olderKey, hit.handle);

    expect(cas.readCacheKeys(CACHE_NAMESPACE)).toEqual([olderKey]);
    expect(await adapter.acquireExact(coordinate)).toBeNull();
    await adapter.close();
  });
});
