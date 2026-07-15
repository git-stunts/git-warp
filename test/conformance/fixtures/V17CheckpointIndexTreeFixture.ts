import { vi } from 'vitest';
import type { CheckpointBasis } from '../../../src/ports/CheckpointStorePort.ts';
import type { OpticFixtureGraph } from './V17CheckpointTailOpticGraphFixture.ts';
import V17CheckpointTailOpticFixtureError from './V17CheckpointTailOpticFixtureError.ts';

/** Injects bounded-basis failures through the semantic checkpoint port. */
export default class V17CheckpointIndexTreeFixture {
  private readonly graph: OpticFixtureGraph;
  private readonly checkpointSha: string;

  private constructor(options: {
    readonly graph: OpticFixtureGraph;
    readonly checkpointSha: string;
  }) {
    this.graph = options.graph;
    this.checkpointSha = options.checkpointSha;
    Object.freeze(this);
  }

  static async load(graph: OpticFixtureGraph): Promise<V17CheckpointIndexTreeFixture> {
    const checkpointSha = await graph._checkpointStore.resolveHead(graph.graphName);
    if (checkpointSha === null) {
      throw new V17CheckpointTailOpticFixtureError(
        'indexed checkpoint fixture must publish a checkpoint',
      );
    }
    return new V17CheckpointIndexTreeFixture({ graph, checkpointSha });
  }

  async replaceWithEmptyIndexTree(): Promise<void> {
    const store = this.graph._checkpointStore;
    const originalLoadBasis = store.loadBasis.bind(store);
    const basis = await originalLoadBasis(this.checkpointSha);
    vi.spyOn(store, 'loadBasis').mockImplementation(async (checkpointSha: string) => {
      if (checkpointSha !== this.checkpointSha) {
        return await originalLoadBasis(checkpointSha);
      }
      return emptyIndexBasis(basis);
    });
  }
}

function emptyIndexBasis(basis: CheckpointBasis): CheckpointBasis {
  return Object.freeze({
    ...basis,
    indexShardHandles: Object.freeze({}),
  });
}
