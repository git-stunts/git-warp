import { describe, expect, it } from 'vitest';
import MaterializationCoordinate
  from '../../../../src/domain/materialization/MaterializationCoordinate.ts';
import MaterializationHandle
  from '../../../../src/domain/materialization/MaterializationHandle.ts';
import MaterializationRoot
  from '../../../../src/domain/materialization/MaterializationRoot.ts';
import MaterializationRoots
  from '../../../../src/domain/materialization/MaterializationRoots.ts';
import BundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import StorageRetentionWitness, {
  StorageRetentionRoot,
} from '../../../../src/domain/storage/StorageRetentionWitness.ts';
import GitCasMaterializationReplayBasis
  from '../../../../src/infrastructure/adapters/GitCasMaterializationReplayBasis.ts';
import NodeCryptoAdapter
  from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';

describe('GitCasMaterializationReplayBasis', () => {
  it('fails closed for invalid, partial, and missing replay bases', async () => {
    const replay = new GitCasMaterializationReplayBasis({
      cas: {
        assets: { open: () => emptyBytes() },
        bundles: { getMemberReference: async () => null },
      },
      codec: defaultCodec,
      crypto: new NodeCryptoAdapter(),
    });
    const retainedReplay = MaterializationRoot.retained(
      new BundleHandle('test:replay-basis'),
    );

    await expect(replay.load(
      Object.freeze({}) as unknown as MaterializationHandle,
    )).rejects.toThrow('replay basis requires a MaterializationHandle');
    await expect(replay.load(materialization(
      MaterializationRoot.unavailable(),
      null,
    ))).resolves.toBeNull();
    await expect(replay.load(materialization(
      retainedReplay,
      null,
    ))).rejects.toThrow('partial materialization cannot contain a replay basis');
    await expect(replay.load(materialization(
      retainedReplay,
      'state-hash',
    ))).rejects.toThrow('replay basis root has no state asset');
  });
});

function materialization(
  replayBasis: MaterializationRoot,
  stateHash: string | null,
): MaterializationHandle {
  const bundle = new BundleHandle('test:materialization');
  return new MaterializationHandle({
    laneName: 'events',
    bundle,
    coordinate: new MaterializationCoordinate({
      frontier: new Map(),
      ceiling: null,
    }),
    roots: rootsWithReplayBasis(replayBasis),
    stateHash,
    retention: new StorageRetentionWitness({
      handle: bundle,
      policy: 'evictable',
      reachability: 'anchored',
      root: new StorageRetentionRoot({
        kind: 'cache-set',
        namespace: 'git-warp/materializations',
        locator: 'refs/cas/caches/git-warp/materializations',
        generation: 'generation-1',
        path: 'root-00000000',
      }),
      observedAt: '1970-01-01T00:00:00.000Z',
    }),
  });
}

function rootsWithReplayBasis(replayBasis: MaterializationRoot): MaterializationRoots {
  return new MaterializationRoots({
    adjacency: MaterializationRoot.unavailable(),
    edgeAlive: MaterializationRoot.unavailable(),
    edgeBirths: MaterializationRoot.unavailable(),
    frontier: MaterializationRoot.unavailable(),
    nodeAlive: MaterializationRoot.unavailable(),
    properties: MaterializationRoot.unavailable(),
    provenanceSupport: MaterializationRoot.unavailable(),
    replayBasis,
    roaringIndexes: MaterializationRoot.unavailable(),
  });
}

async function* emptyBytes(): AsyncGenerator<Uint8Array> {
  // Missing members fail before asset bytes are requested.
}
