import type { OpticFixtureGraph } from './V17CheckpointTailOpticGraphFixture.ts';
import V17CheckpointShardIndexFixture from './V17CheckpointShardIndexFixture.ts';
import V17CheckpointTargetShardFixture from './V17CheckpointTargetShardFixture.ts';

export default class V17CheckpointPropertyShardFixture {
  private readonly targetShard: V17CheckpointTargetShardFixture;

  private constructor(targetShard: V17CheckpointTargetShardFixture) {
    this.targetShard = targetShard;
    Object.freeze(this);
  }

  static async forNode(graph: OpticFixtureGraph, nodeId: string): Promise<V17CheckpointPropertyShardFixture> {
    const shardIndex = await V17CheckpointShardIndexFixture.load(graph);
    return new V17CheckpointPropertyShardFixture(
      new V17CheckpointTargetShardFixture({
        graph,
        shardOid: shardIndex.propertyShardOid(nodeId),
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
