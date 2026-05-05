import { partitionShardOids } from '../../../src/domain/services/MaterializedViewHelpers.ts';
import { partitionTreeOids } from '../../../src/domain/services/state/checkpointHelpers.ts';
import { buildCheckpointRef } from '../../../src/domain/utils/RefLayout.ts';
import computeShardKey from '../../../src/domain/utils/shardKey.ts';
import type { OpticFixtureGraph } from './V17CheckpointTailOpticGraphFixture.ts';
import V17CheckpointTailOpticFixtureError from './V17CheckpointTailOpticFixtureError.ts';

export default class V17CheckpointShardIndexFixture {
  private readonly indexOids: Record<string, string>;
  private readonly propOids: Record<string, string>;

  private constructor(options: {
    readonly indexOids: Record<string, string>;
    readonly propOids: Record<string, string>;
  }) {
    this.indexOids = Object.freeze({ ...options.indexOids });
    this.propOids = Object.freeze({ ...options.propOids });
    Object.freeze(this);
  }

  static async load(graph: OpticFixtureGraph): Promise<V17CheckpointShardIndexFixture> {
    const checkpointSha = await graph._persistence.readRef(buildCheckpointRef(graph.graphName));
    if (checkpointSha === null) {
      throw new V17CheckpointTailOpticFixtureError('indexed checkpoint fixture must publish a checkpoint ref');
    }

    const checkpointMessage = graph._commitMessageCodec.decodeCheckpoint(
      await graph._persistence.showNode(checkpointSha),
    );
    const { treeOids, indexShardOids } = partitionTreeOids(
      await graph._persistence.readTreeOids(checkpointMessage.indexOid),
    );
    const shardOids = Object.keys(indexShardOids).length > 0
      ? indexShardOids
      : await V17CheckpointShardIndexFixture.nestedIndexShardOids(graph, treeOids);
    const { indexOids, propOids } = partitionShardOids(shardOids);
    return new V17CheckpointShardIndexFixture({ indexOids, propOids });
  }

  nodeLivenessShardOid(nodeId: string): string {
    return this.requireShardOid(this.indexOids, `meta_${computeShardKey(nodeId)}.cbor`);
  }

  propertyShardOid(nodeId: string): string {
    return this.requireShardOid(this.propOids, `props_${computeShardKey(nodeId)}.cbor`);
  }

  private requireShardOid(shardOids: Record<string, string>, path: string): string {
    const oid = shardOids[path];
    if (oid === undefined) {
      throw new V17CheckpointTailOpticFixtureError(`indexed checkpoint fixture must include ${path}`);
    }

    return oid;
  }

  private static async nestedIndexShardOids(
    graph: OpticFixtureGraph,
    treeOids: Record<string, string>,
  ): Promise<Record<string, string>> {
    const indexTreeOid = treeOids['index'];
    if (indexTreeOid === undefined) {
      throw new V17CheckpointTailOpticFixtureError('indexed checkpoint fixture must include index subtree');
    }

    return await graph._persistence.readTreeOids(indexTreeOid);
  }
}
