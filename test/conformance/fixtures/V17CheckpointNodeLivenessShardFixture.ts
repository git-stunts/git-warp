import type { OpticFixtureGraph } from './V17CheckpointTailOpticGraphFixture.ts';
import computeShardKey from '../../../src/domain/utils/shardKey.ts';
import V17CheckpointTailOpticFixtureError from './V17CheckpointTailOpticFixtureError.ts';
import V17CheckpointTargetShardFixture from './V17CheckpointTargetShardFixture.ts';

export default class V17CheckpointNodeLivenessShardFixture {
  private readonly targetShard: V17CheckpointTargetShardFixture;

  private constructor(targetShard: V17CheckpointTargetShardFixture) {
    this.targetShard = targetShard;
    Object.freeze(this);
  }

  static async forNode(graph: OpticFixtureGraph, nodeId: string): Promise<V17CheckpointNodeLivenessShardFixture> {
    const sha = await graph._checkpointStore.resolveHead(graph.graphName);
    if (sha === null) throw new V17CheckpointTailOpticFixtureError('checkpoint required');
    const basis = await graph._checkpointStore.loadBasis(sha);
    const root = basis.indexRoot;
    if (root === null) throw new V17CheckpointTailOpticFixtureError('checkpoint root required');
    return new V17CheckpointNodeLivenessShardFixture(
      new V17CheckpointTargetShardFixture({
        graph,
        root,
        path: `meta_${computeShardKey(nodeId)}.cbor`,
      }),
    );
  }

  makeUnavailable(): void {
    this.targetShard.makeUnavailable();
  }

  makeInvalid(): void {
    this.targetShard.makeInvalid();
  }
}
