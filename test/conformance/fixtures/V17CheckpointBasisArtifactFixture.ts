import { buildCheckpointRef } from '../../../src/domain/utils/RefLayout.ts';
import type { OpticFixtureGraph } from './V17CheckpointTailOpticGraphFixture.ts';
import V17CheckpointTailOpticFixtureError from './V17CheckpointTailOpticFixtureError.ts';

export default class V17CheckpointBasisArtifactFixture {
  private readonly frontierOidValue: string;

  private constructor(options: {
    readonly frontierOid: string;
  }) {
    if (options.frontierOid.length === 0) {
      throw new V17CheckpointTailOpticFixtureError('checkpoint frontier oid must be non-empty');
    }

    this.frontierOidValue = options.frontierOid;
    Object.freeze(this);
  }

  static async load(graph: OpticFixtureGraph): Promise<V17CheckpointBasisArtifactFixture> {
    const checkpointSha = await graph._persistence.readRef(buildCheckpointRef(graph.graphName));
    if (checkpointSha === null) {
      throw new V17CheckpointTailOpticFixtureError('indexed checkpoint fixture must publish a checkpoint ref');
    }

    const checkpointMessage = graph._commitMessageCodec.decodeCheckpoint(
      await graph._persistence.showNode(checkpointSha),
    );
    return new V17CheckpointBasisArtifactFixture({
      frontierOid: checkpointMessage.frontierOid,
    });
  }

  frontierOid(): string {
    return this.frontierOidValue;
  }
}
