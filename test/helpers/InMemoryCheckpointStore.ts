import AssetHandle from '../../src/domain/storage/AssetHandle.ts';
import BundleHandle from '../../src/domain/storage/BundleHandle.ts';
import StorageRetentionWitness, {
  StorageRetentionRoot,
} from '../../src/domain/storage/StorageRetentionWitness.ts';
import CheckpointStorePort, {
  type CheckpointBasis,
  type CheckpointData,
  type CheckpointMetadata,
  type CheckpointRecord,
  type PublishedCheckpoint,
} from '../../src/ports/CheckpointStorePort.ts';

/** Storage-neutral checkpoint fixture for domain service tests. */
export default class InMemoryCheckpointStore extends CheckpointStorePort {
  readonly #checkpoints = new Map<string, CheckpointData>();
  readonly #checkpointGraphs = new Map<string, string>();
  readonly #heads = new Map<string, string>();
  #sequence = 0;
  lastPublished: CheckpointRecord | null = null;

  override async publishCheckpoint(record: CheckpointRecord): Promise<PublishedCheckpoint> {
    const currentHead = this.#heads.get(record.graphName) ?? null;
    if (record.expectedCheckpointSha !== undefined
      && record.expectedCheckpointSha !== currentHead) {
      throw new Error(
        `Checkpoint head mismatch: expected ${record.expectedCheckpointSha ?? '<none>'}, `
          + `found ${currentHead ?? '<none>'}`,
      );
    }
    const checkpointSha = (++this.#sequence).toString(16).padStart(40, '0');
    const indexShardHandles = record.indexShards === null || record.indexShards === undefined
      ? null
      : Object.freeze(Object.fromEntries(
        Object.keys(record.indexShards).sort().map((path) => [
          path,
          new AssetHandle(`checkpoint-shard:${checkpointSha}:${path}`),
        ]),
      ));
    this.lastPublished = record;
    this.#checkpoints.set(checkpointSha, {
      state: record.state,
      frontier: new Map(record.frontier),
      stateHash: record.stateHash,
      schema: 5,
      appliedVV: record.appliedVV,
      indexShardHandles,
      ...(record.provenanceIndex === undefined || record.provenanceIndex === null
        ? {}
        : { provenanceIndex: record.provenanceIndex }),
    });
    this.#checkpointGraphs.set(checkpointSha, record.graphName);
    this.#heads.set(record.graphName, checkpointSha);
    const bundleHandle = new BundleHandle(`checkpoint-bundle:${checkpointSha}`);
    return Object.freeze({
      checkpointSha,
      bundleHandle,
      retention: new StorageRetentionWitness({
        handle: bundleHandle,
        policy: 'pinned',
        reachability: 'anchored',
        root: new StorageRetentionRoot({
          kind: 'publication',
          namespace: record.graphName,
          locator: `checkpoint:${record.graphName}`,
          generation: checkpointSha,
          path: '/',
        }),
        observedAt: new Date(0).toISOString(),
      }),
    });
  }

  override async resolveHead(graphName: string): Promise<string | null> {
    return this.#heads.get(graphName) ?? null;
  }

  override async loadCheckpoint(
    checkpointSha: string,
    expectedGraphName?: string,
  ): Promise<CheckpointData> {
    const checkpoint = this.#checkpoints.get(checkpointSha);
    if (checkpoint === undefined) {
      throw new Error(`Checkpoint not found: ${checkpointSha}`);
    }
    const actualGraphName = this.#checkpointGraphs.get(checkpointSha);
    if (expectedGraphName !== undefined && actualGraphName !== expectedGraphName) {
      throw new Error(
        `Checkpoint ${checkpointSha} belongs to graph ${actualGraphName ?? '<unknown>'}, `
          + `not ${expectedGraphName}`,
      );
    }
    return checkpoint;
  }

  override async readMetadata(
    checkpointSha: string,
    expectedGraphName?: string,
  ): Promise<CheckpointMetadata> {
    const checkpoint = await this.loadCheckpoint(checkpointSha, expectedGraphName);
    return Object.freeze({
      checkpointSha,
      stateHash: checkpoint.stateHash,
      schema: checkpoint.schema,
    });
  }

  override async loadBasis(
    checkpointSha: string,
    expectedGraphName?: string,
  ): Promise<CheckpointBasis> {
    const checkpoint = await this.loadCheckpoint(checkpointSha, expectedGraphName);
    if (checkpoint.indexShardHandles === null) {
      throw new Error(`Checkpoint has no index basis: ${checkpointSha}`);
    }
    return Object.freeze({
      checkpointSha,
      stateHash: checkpoint.stateHash,
      schema: checkpoint.schema,
      frontier: new Map(checkpoint.frontier),
      indexShardHandles: checkpoint.indexShardHandles,
    });
  }

  override async publishCoverage(_options: {
    graphName: string;
    parents: string[];
  }): Promise<string> {
    const suffix = (++this.#sequence).toString(16).padStart(40, '0');
    return suffix;
  }
}
