import { partitionShardHandles } from '../../../src/domain/services/MaterializedViewHelpers.ts';
import computeShardKey from '../../../src/domain/utils/shardKey.ts';
import type AssetHandle from '../../../src/domain/storage/AssetHandle.ts';
import type { OpticFixtureGraph } from './V17CheckpointTailOpticGraphFixture.ts';
import V17CheckpointTailOpticFixtureError from './V17CheckpointTailOpticFixtureError.ts';

export default class V17CheckpointShardIndexFixture {
  private readonly indexHandles: Readonly<Record<string, AssetHandle>>;
  private readonly propHandles: Readonly<Record<string, AssetHandle>>;

  private constructor(options: {
    readonly indexHandles: Readonly<Record<string, AssetHandle>>;
    readonly propHandles: Readonly<Record<string, AssetHandle>>;
  }) {
    this.indexHandles = options.indexHandles;
    this.propHandles = options.propHandles;
    Object.freeze(this);
  }

  static async load(graph: OpticFixtureGraph): Promise<V17CheckpointShardIndexFixture> {
    const checkpointSha = await graph._checkpointStore.resolveHead(graph.graphName);
    if (checkpointSha === null) {
      throw new V17CheckpointTailOpticFixtureError(
        'indexed checkpoint fixture must publish a checkpoint',
      );
    }
    const basis = await graph._checkpointStore.loadBasis(checkpointSha);
    return new V17CheckpointShardIndexFixture(
      partitionShardHandles(basis.indexShardHandles),
    );
  }

  nodeLivenessShardOid(nodeId: string): AssetHandle {
    return this.requireShardHandle(this.indexHandles, `meta_${computeShardKey(nodeId)}.cbor`);
  }

  propertyShardOid(nodeId: string): AssetHandle {
    return this.requireShardHandle(this.propHandles, `props_${computeShardKey(nodeId)}.cbor`);
  }

  private requireShardHandle(
    shardHandles: Readonly<Record<string, AssetHandle>>,
    path: string,
  ): AssetHandle {
    const handle = shardHandles[path];
    if (handle === undefined) {
      throw new V17CheckpointTailOpticFixtureError(
        `indexed checkpoint fixture must include ${path}`,
      );
    }
    return handle;
  }
}
