import type { OpticFixtureGraph } from './V17CheckpointTailOpticGraphFixture.ts';
import { materializationPropertyShardPath } from '../../../src/domain/materialization/MaterializationPropertyProfile.ts';
import V17CheckpointTailOpticFixtureError from './V17CheckpointTailOpticFixtureError.ts';
import V17CheckpointTargetShardFixture from './V17CheckpointTargetShardFixture.ts';

export default class V17CheckpointPropertyShardFixture {
  private readonly targetShard: V17CheckpointTargetShardFixture;

  private constructor(targetShard: V17CheckpointTargetShardFixture) {
    this.targetShard = targetShard;
    Object.freeze(this);
  }

  static async forNode(graph: OpticFixtureGraph, nodeId: string): Promise<V17CheckpointPropertyShardFixture> {
    const sha = await graph._checkpointStore.resolveHead(graph.graphName);
    if (sha === null) throw new V17CheckpointTailOpticFixtureError('checkpoint required');
    const basis = await graph._checkpointStore.loadBasis(sha);
    const root = basis.propertyRoot;
    if (root === null) throw new V17CheckpointTailOpticFixtureError('checkpoint root required');
    return new V17CheckpointPropertyShardFixture(
      new V17CheckpointTargetShardFixture({
        graph,
        root,
        path: materializationPropertyShardPath(nodeId),
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
