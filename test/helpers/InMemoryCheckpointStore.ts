import AssetHandle from '../../src/domain/storage/AssetHandle.ts';
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
  readonly #heads = new Map<string, string>();
  #sequence = 0;
  lastPublished: CheckpointRecord | null = null;

  override async publishCheckpoint(record: CheckpointRecord): Promise<PublishedCheckpoint> {
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
    this.#heads.set(record.graphName, checkpointSha);
    return Object.freeze({ checkpointSha });
  }

  override async resolveHead(graphName: string): Promise<string | null> {
    return this.#heads.get(graphName) ?? null;
  }

  override async loadCheckpoint(checkpointSha: string): Promise<CheckpointData> {
    const checkpoint = this.#checkpoints.get(checkpointSha);
    if (checkpoint === undefined) {
      throw new Error(`Checkpoint not found: ${checkpointSha}`);
    }
    return checkpoint;
  }

  override async readMetadata(checkpointSha: string): Promise<CheckpointMetadata> {
    const checkpoint = await this.loadCheckpoint(checkpointSha);
    return Object.freeze({
      checkpointSha,
      stateHash: checkpoint.stateHash,
      schema: checkpoint.schema,
    });
  }

  override async loadBasis(checkpointSha: string): Promise<CheckpointBasis> {
    const checkpoint = await this.loadCheckpoint(checkpointSha);
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

  override async publishCoverage(options: {
    graphName: string;
    parents: string[];
  }): Promise<string> {
    const suffix = (++this.#sequence).toString(16).padStart(40, '0');
    return `${options.graphName.length.toString(16)}${suffix}`.slice(-40);
  }
}
