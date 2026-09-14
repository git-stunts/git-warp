import type { IndexShard } from '../../artifacts/IndexShard.ts';
import WarpError from '../../errors/WarpError.ts';
import MaterializationRoot from '../../materialization/MaterializationRoot.ts';
import WarpStream from '../../stream/WarpStream.ts';
import type ArtifactStagingPort from '../../../ports/ArtifactStagingPort.ts';
import IndexStorePort, {
  type IndexShardWriteOptions,
} from '../../../ports/IndexStorePort.ts';

const INDEX_ROOT_BUNDLE_WRITE_OPERATIONS = 1;

export type PendingMaterializationIndexRootWriteFields = Readonly<{
  openShards: () => WarpStream<IndexShard>;
  options: IndexShardWriteOptions;
  shardCount: number;
  store: IndexStorePort;
}>;

/** A repeatable, lazily opened index-shard write prepared for bounded admission. */
export default class PendingMaterializationIndexRootWrite {
  readonly #openShards: () => WarpStream<IndexShard>;
  readonly #options: IndexShardWriteOptions;
  readonly #shardCount: number;
  readonly #store: IndexStorePort;

  constructor(fields: PendingMaterializationIndexRootWriteFields) {
    requireFields(fields);
    this.#openShards = fields.openShards;
    this.#options = Object.freeze({ ...fields.options });
    this.#shardCount = fields.shardCount;
    this.#store = fields.store;
    Object.freeze(this);
  }

  get admissionOperationBound(): number {
    return this.#shardCount + INDEX_ROOT_BUNDLE_WRITE_OPERATIONS;
  }

  get admissionGroupCount(): number {
    return 1;
  }

  async write(staging: ArtifactStagingPort): Promise<MaterializationRoot> {
    const shards = this.#openShards();
    if (!(shards instanceof WarpStream)) {
      throw materializationStorageError('index shard source did not open a WarpStream');
    }
    const handle = await this.#store.writeShards(
      shards,
      { ...this.#options, staging },
    );
    return MaterializationRoot.retained(handle);
  }
}

function requireFields(fields: PendingMaterializationIndexRootWriteFields): void {
  if (typeof fields.openShards !== 'function') {
    throw materializationStorageError('index root write requires a shard source');
  }
  if (!Number.isSafeInteger(fields.shardCount) || fields.shardCount <= 0) {
    throw materializationStorageError('index root write requires a positive shard count');
  }
  if (!(fields.store instanceof IndexStorePort)) {
    throw materializationStorageError('index root write requires an index store');
  }
}

function materializationStorageError(message: string): WarpError {
  return new WarpError(message, 'E_MATERIALIZATION_STORAGE');
}
