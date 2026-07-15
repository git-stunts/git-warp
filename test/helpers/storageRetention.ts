import StorageHandle from '../../src/domain/storage/StorageHandle.ts';
import StorageRetentionWitness, {
  StorageRetentionRoot,
} from '../../src/domain/storage/StorageRetentionWitness.ts';

/** Stable anchored publication evidence for semantic storage tests. */
export function testRetentionWitness(
  generation = 'test-generation',
): StorageRetentionWitness {
  return new StorageRetentionWitness({
    handle: new StorageHandle(`test-asset:${generation}`),
    policy: 'pinned',
    reachability: 'anchored',
    root: new StorageRetentionRoot({
      kind: 'publication',
      namespace: 'test',
      locator: 'refs/warp/test/publications',
      generation,
      path: '/',
    }),
    observedAt: '1970-01-01T00:00:00.000Z',
  });
}
