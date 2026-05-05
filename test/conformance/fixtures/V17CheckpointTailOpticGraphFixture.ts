import InMemoryGraphAdapter from '../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import {
  type RuntimeHostOpenOptions,
  type RuntimeHostProduct,
  openRuntimeHostProduct,
} from '../../../src/domain/warp/RuntimeHostProduct.ts';
import {
  CHECKPOINT_NODE_ID,
  CHECKPOINT_PROPERTY_VALUE,
  PROPERTY_KEY,
} from './V17CheckpointTailOpticFixtureData.ts';
import V17CheckpointTailOpticFixtureError from './V17CheckpointTailOpticFixtureError.ts';

const DEFAULT_WRITER_ID = 'reader';

export type OpticFixtureGraph = RuntimeHostProduct;

type V17CheckpointTailOpticGraphFixtureOptions = {
  readonly persistence?: RuntimeHostOpenOptions['persistence'];
  readonly writerId?: string;
};

export default class V17CheckpointTailOpticGraphFixture {
  readonly graph: OpticFixtureGraph;

  private constructor(graph: OpticFixtureGraph) {
    if (graph.graphName.length === 0) {
      throw new V17CheckpointTailOpticFixtureError('fixture graph name must be non-empty');
    }

    this.graph = graph;
    Object.freeze(this);
  }

  static async openEmpty(
    graphName: string,
    options: V17CheckpointTailOpticGraphFixtureOptions = {},
  ): Promise<V17CheckpointTailOpticGraphFixture> {
    const graph = await openRuntimeHostProduct({
      persistence: options.persistence ?? new InMemoryGraphAdapter(),
      graphName,
      writerId: options.writerId ?? DEFAULT_WRITER_ID,
    });

    return new V17CheckpointTailOpticGraphFixture(graph);
  }

  static async openIndexedCheckpoint(
    graphName: string,
    options: V17CheckpointTailOpticGraphFixtureOptions = {},
  ): Promise<V17CheckpointTailOpticGraphFixture> {
    const fixture = await V17CheckpointTailOpticGraphFixture.openEmpty(graphName, options);
    await fixture.graph.patch((patch) => {
      patch.addNode(CHECKPOINT_NODE_ID);
      patch.setProperty(CHECKPOINT_NODE_ID, PROPERTY_KEY, CHECKPOINT_PROPERTY_VALUE);
    });
    await fixture.graph.materialize();
    await fixture.graph.createCheckpoint();
    return fixture;
  }
}
