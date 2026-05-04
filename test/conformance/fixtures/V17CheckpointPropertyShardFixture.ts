import { vi } from 'vitest';
import PersistenceError from '../../../src/domain/errors/PersistenceError.ts';
import { partitionShardOids } from '../../../src/domain/services/MaterializedViewHelpers.ts';
import { partitionTreeOids } from '../../../src/domain/services/state/checkpointHelpers.ts';
import { buildCheckpointRef } from '../../../src/domain/utils/RefLayout.ts';
import computeShardKey from '../../../src/domain/utils/shardKey.ts';
import type { OpticFixtureGraph } from './V17CheckpointTailOpticGraphFixture.ts';
import V17CheckpointTailOpticFixtureError from './V17CheckpointTailOpticFixtureError.ts';

export default class V17CheckpointPropertyShardFixture {
  private readonly graph: OpticFixtureGraph;
  private readonly propertyShardOid: string;

  private constructor(graph: OpticFixtureGraph, propertyShardOid: string) {
    if (propertyShardOid.length === 0) {
      throw new V17CheckpointTailOpticFixtureError('property shard oid must be non-empty');
    }

    this.graph = graph;
    this.propertyShardOid = propertyShardOid;
    Object.freeze(this);
  }

  static async forNode(graph: OpticFixtureGraph, nodeId: string): Promise<V17CheckpointPropertyShardFixture> {
    return new V17CheckpointPropertyShardFixture(
      graph,
      await V17CheckpointPropertyShardFixture.checkpointPropertyShardOid(graph, nodeId),
    );
  }

  makeUnavailable(): void {
    const originalReadBlob = this.graph._persistence.readBlob.bind(this.graph._persistence);
    vi.spyOn(this.graph._persistence, 'readBlob').mockImplementation(async (oid: string) => {
      if (oid === this.propertyShardOid) {
        throw new PersistenceError(
          `Blob not found: ${oid}`,
          PersistenceError.E_MISSING_OBJECT,
        );
      }

      return await originalReadBlob(oid);
    });
  }

  makeInvalid(): void {
    const originalReadBlob = this.graph._persistence.readBlob.bind(this.graph._persistence);
    vi.spyOn(this.graph._persistence, 'readBlob').mockImplementation(async (oid: string) => {
      if (oid === this.propertyShardOid) {
        return this.graph._codec.encode(Object.freeze({ invalid: true }));
      }

      return await originalReadBlob(oid);
    });
  }

  private static async checkpointPropertyShardOid(
    graph: OpticFixtureGraph,
    nodeId: string,
  ): Promise<string> {
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
      : await V17CheckpointPropertyShardFixture.nestedIndexShardOids(graph, treeOids);
    const { propOids } = partitionShardOids(shardOids);
    const path = `props_${computeShardKey(nodeId)}.cbor`;
    const oid = propOids[path];
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
