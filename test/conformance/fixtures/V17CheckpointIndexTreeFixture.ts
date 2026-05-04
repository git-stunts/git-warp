import type { CheckpointCommitMessage } from '../../../src/ports/CommitMessageCodecPort.ts';
import { CHECKPOINT_SCHEMA_INDEX_TREE } from '../../../src/domain/services/state/checkpointHelpers.ts';
import { buildCheckpointRef } from '../../../src/domain/utils/RefLayout.ts';
import type { OpticFixtureGraph } from './V17CheckpointTailOpticGraphFixture.ts';
import V17CheckpointTailOpticFixtureError from './V17CheckpointTailOpticFixtureError.ts';

export default class V17CheckpointIndexTreeFixture {
  private readonly graph: OpticFixtureGraph;
  private readonly checkpointMessage: CheckpointCommitMessage;
  private readonly checkpointParents: readonly string[];

  private constructor(options: {
    readonly graph: OpticFixtureGraph;
    readonly checkpointSha: string;
    readonly checkpointMessage: CheckpointCommitMessage;
    readonly checkpointParents: readonly string[];
  }) {
    if (options.checkpointSha.length === 0) {
      throw new V17CheckpointTailOpticFixtureError('checkpoint sha must be non-empty');
    }

    this.graph = options.graph;
    this.checkpointMessage = options.checkpointMessage;
    this.checkpointParents = Object.freeze([...options.checkpointParents]);
    Object.freeze(this);
  }

  static async load(graph: OpticFixtureGraph): Promise<V17CheckpointIndexTreeFixture> {
    const checkpointSha = await graph._persistence.readRef(buildCheckpointRef(graph.graphName));
    if (checkpointSha === null) {
      throw new V17CheckpointTailOpticFixtureError('indexed checkpoint fixture must publish a checkpoint ref');
    }

    return new V17CheckpointIndexTreeFixture({
      graph,
      checkpointSha,
      checkpointMessage: graph._commitMessageCodec.decodeCheckpoint(
        await graph._persistence.showNode(checkpointSha),
      ),
      checkpointParents: (await graph._persistence.getNodeInfo(checkpointSha)).parents,
    });
  }

  async replaceWithEmptyIndexTree(): Promise<void> {
    const rootTreeOids = await this.graph._persistence.readTreeOids(this.checkpointMessage.indexOid);
    const emptyIndexTreeOid = await this.graph._persistence.writeTree([]);
    const replacementRootTreeOid = await this.graph._persistence.writeTree([
      ...nonIndexRootBlobEntries(rootTreeOids),
      `040000 tree ${emptyIndexTreeOid}\tindex`,
    ].sort());
    const replacementSha = await this.graph._persistence.commitNodeWithTree({
      treeOid: replacementRootTreeOid,
      parents: [...this.checkpointParents],
      message: this.graph._commitMessageCodec.encodeCheckpoint({
        ...this.checkpointMessage,
        schema: CHECKPOINT_SCHEMA_INDEX_TREE,
        indexOid: replacementRootTreeOid,
      }),
    });
    await this.graph._persistence.updateRef(buildCheckpointRef(this.graph.graphName), replacementSha);
  }
}

function nonIndexRootBlobEntries(rootTreeOids: Record<string, string>): readonly string[] {
  return Object.freeze(
    Object.entries(rootTreeOids)
      .filter(([path]) => path !== 'index' && !path.startsWith('index/'))
      .map(([path, oid]) => `100644 blob ${oid}\t${path}`),
  );
}
