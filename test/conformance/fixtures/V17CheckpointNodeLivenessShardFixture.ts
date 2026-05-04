import type { OpticFixtureGraph } from './V17CheckpointTailOpticGraphFixture.ts';
import V17CheckpointShardIndexFixture from './V17CheckpointShardIndexFixture.ts';
import V17CheckpointTargetShardFixture from './V17CheckpointTargetShardFixture.ts';

export default class V17CheckpointNodeLivenessShardFixture {
  private readonly targetShard: V17CheckpointTargetShardFixture;

  private constructor(targetShard: V17CheckpointTargetShardFixture) {
    this.targetShard = targetShard;
    Object.freeze(this);
  }

  static async forNode(graph: OpticFixtureGraph, nodeId: string): Promise<V17CheckpointNodeLivenessShardFixture> {
    const shardIndex = await V17CheckpointShardIndexFixture.load(graph);
    return new V17CheckpointNodeLivenessShardFixture(
      new V17CheckpointTargetShardFixture({
        graph,
        shardOid: shardIndex.nodeLivenessShardOid(nodeId),
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
