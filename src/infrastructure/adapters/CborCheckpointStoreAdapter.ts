import {
  BundleHandle as GitCasBundleHandle,
  type AssetCapability,
  type BundleCapability,
  type PageCapability,
  type PublicationCapability,
} from '@git-stunts/git-cas';
import { computeAppliedVV } from '../../domain/services/state/CheckpointSerializer.ts';
import { CURRENT_CHECKPOINT_SCHEMA } from '../../domain/services/state/checkpointHelpers.ts';
import PersistenceError from '../../domain/errors/PersistenceError.ts';
import type BundleHandle from '../../domain/storage/BundleHandle.ts';
import { buildCheckpointRef, buildCoverageRef } from '../../domain/utils/RefLayout.ts';
import CheckpointStorePort, {
  type CheckpointBasis,
  type CheckpointData,
  type CheckpointMetadata,
  type CheckpointRecord,
  type PublishedCheckpoint,
} from '../../ports/CheckpointStorePort.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import {
  CHECKPOINT_STORAGE_FORMAT,
  type default as CommitMessageCodecPort,
} from '../../ports/CommitMessageCodecPort.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import { requireAdapterDependency } from './AdapterDependencyGuard.ts';
import {
  checkpointMaterializationMismatch,
  requireCheckpointMaterialization,
  requirePublishedBundle,
  requireRetainedBundle,
} from './CheckpointMaterializationPublication.ts';
import {
  requireCheckpointGraph,
  requireCurrentCheckpointBundle,
  requireCurrentCheckpointSchema,
  retainedRootHandle,
} from './CurrentCheckpointStorageValidation.ts';
import { adaptGitCasRetentionWitness } from './GitCasRetentionWitnessAdapter.ts';
import GitCasMaterializationSnapshotReader, {
  type MaterializationBasisSnapshot,
} from './GitCasMaterializationSnapshotReader.ts';

interface CheckpointHistory {
  commitNode(options: { message: string; parents: string[] }): Promise<string>;
  showNode(sha: string): Promise<string>;
  readRef(ref: string): Promise<string | null>;
  compareAndSwapRef(
    ref: string,
    newOid: string,
    expectedOid: string | null,
  ): Promise<void>;
}

export type GitCasCheckpointFacade = {
  readonly assets: Pick<AssetCapability, 'open'>;
  readonly pages: Pick<PageCapability, 'get'>;
  readonly bundles: Pick<
    BundleCapability,
    'getMemberReference' | 'iterateMemberReferences' | 'putOrdered'
  >;
  readonly publications: Pick<PublicationCapability, 'commit'>;
};

type CheckpointLayout = {
  readonly bundleHandle: BundleHandle;
  readonly metadata: ReturnType<CommitMessageCodecPort['decodeCheckpoint']>;
  readonly materialization: MaterializationBasisSnapshot;
  readonly indexRoot: BundleHandle | null;
  readonly propertyRoot: BundleHandle | null;
};

const EMPTY_INDEX_SHARD_HANDLES = Object.freeze({});

/** Publishes and reads current checkpoints as retained git-cas bundles. */
export class CborCheckpointStoreAdapter extends CheckpointStorePort {
  readonly #messageCodec: CommitMessageCodecPort;
  readonly #history: CheckpointHistory;
  readonly #cas: GitCasCheckpointFacade;
  readonly #materializationSnapshots: GitCasMaterializationSnapshotReader;

  constructor(options: {
    codec: CodecPort;
    crypto: CryptoPort;
    commitMessageCodec: CommitMessageCodecPort;
    history: CheckpointHistory;
    cas: GitCasCheckpointFacade;
  }) {
    super();
    requireAdapterDependency(options.codec, 'codec');
    requireAdapterDependency(options.crypto, 'crypto');
    requireAdapterDependency(options.commitMessageCodec, 'commitMessageCodec');
    requireAdapterDependency(options.history, 'history');
    requireAdapterDependency(options.cas, 'cas');
    this.#messageCodec = options.commitMessageCodec;
    this.#history = options.history;
    this.#cas = options.cas;
    this.#materializationSnapshots = new GitCasMaterializationSnapshotReader({
      cas: options.cas,
      codec: options.codec,
      crypto: options.crypto,
    });
  }

  override async publishCheckpoint(
    record: CheckpointRecord,
  ): Promise<PublishedCheckpoint> {
    const checkpointRef = buildCheckpointRef(record.graphName);
    const expectedHead = record.expectedCheckpointSha === undefined
      ? await this.#history.readRef(checkpointRef)
      : record.expectedCheckpointSha;
    const materialization = requireCheckpointMaterialization(record);
    const bundleHandle = materialization.bundle;
    const root = GitCasBundleHandle.parse(bundleHandle.toString());
    const message = this.#messageCodec.encodeCheckpoint({
      kind: 'checkpoint',
      graph: record.graphName,
      stateHash: record.stateHash,
      schema: CURRENT_CHECKPOINT_SCHEMA,
      checkpointVersion: CHECKPOINT_STORAGE_FORMAT,
      bundleHandle,
    });
    const publication = await this.#cas.publications.commit({
      root,
      commit: { parents: record.parents, message },
      ref: { name: checkpointRef, expected: expectedHead },
    });
    requirePublishedBundle(publication.root.toString(), bundleHandle);
    const retention = adaptGitCasRetentionWitness(publication.witness.toJSON());
    requireRetainedBundle(retention.handle.toString(), bundleHandle);
    return Object.freeze({
      checkpointSha: publication.commitId,
      bundleHandle,
      retention,
    });
  }

  override async resolveHead(graphName: string): Promise<string | null> {
    return await this.#history.readRef(buildCheckpointRef(graphName));
  }

  override async loadCheckpoint(
    checkpointSha: string,
    expectedGraphName?: string,
  ): Promise<CheckpointData> {
    const layout = await this.#readLayout(checkpointSha, expectedGraphName);
    const materialization = await this.#materializationSnapshots.resolve(
      layout.materialization,
    );
    const { state } = materialization;
    const result: CheckpointData = {
      state,
      frontier: materialization.coordinate.frontier(),
      stateHash: layout.metadata.stateHash,
      schema: layout.metadata.schema,
      appliedVV: computeAppliedVV(state),
      indexShardHandles: null,
      indexRoot: layout.indexRoot,
      propertyRoot: layout.propertyRoot,
    };
    if (materialization.provenanceIndex !== null) {
      result.provenanceIndex = materialization.provenanceIndex;
    }
    return result;
  }

  override async readMetadata(
    checkpointSha: string,
    expectedGraphName?: string,
  ): Promise<CheckpointMetadata> {
    const metadata = this.#messageCodec.decodeCheckpoint(
      await this.#history.showNode(checkpointSha),
    );
    requireCheckpointGraph(checkpointSha, metadata.graph, expectedGraphName);
    requireCurrentCheckpointSchema(checkpointSha, metadata.schema);
    requireCurrentCheckpointBundle(checkpointSha, metadata);
    return Object.freeze({
      checkpointSha,
      stateHash: metadata.stateHash,
      schema: metadata.schema,
    });
  }

  override async loadBasis(
    checkpointSha: string,
    expectedGraphName?: string,
  ): Promise<CheckpointBasis> {
    const layout = await this.#readLayout(checkpointSha, expectedGraphName);
    if (layout.indexRoot === null && layout.propertyRoot === null) {
      throw new PersistenceError(
        `Checkpoint ${checkpointSha} has no bounded index basis`,
        'E_CHECKPOINT_MISSING_INDEX',
        { context: { checkpointSha } },
      );
    }
    return Object.freeze({
      checkpointSha,
      stateHash: layout.metadata.stateHash,
      schema: layout.metadata.schema,
      frontier: layout.materialization.coordinate.frontier(),
      indexShardHandles: EMPTY_INDEX_SHARD_HANDLES,
      indexRoot: layout.indexRoot,
      propertyRoot: layout.propertyRoot,
    });
  }

  override async publishCoverage(options: {
    graphName: string;
    parents: string[];
  }): Promise<string> {
    const ref = buildCoverageRef(options.graphName);
    const expectedHead = await this.#history.readRef(ref);
    const message = this.#messageCodec.encodeAnchor({
      kind: 'anchor',
      graph: options.graphName,
      schema: 2,
    });
    const sha = await this.#history.commitNode({
      message,
      parents: options.parents,
    });
    await this.#history.compareAndSwapRef(ref, sha, expectedHead);
    return sha;
  }

  async #readLayout(
    checkpointSha: string,
    expectedGraphName?: string,
  ): Promise<CheckpointLayout> {
    const metadata = this.#messageCodec.decodeCheckpoint(
      await this.#history.showNode(checkpointSha),
    );
    requireCheckpointGraph(checkpointSha, metadata.graph, expectedGraphName);
    requireCurrentCheckpointSchema(checkpointSha, metadata.schema);
    const bundleHandle = requireCurrentCheckpointBundle(
      checkpointSha,
      metadata,
    );
    const materialization = await this.#materializationSnapshots.readBasis(
      bundleHandle,
    );
    if (materialization.stateHash !== metadata.stateHash) {
      throw checkpointMaterializationMismatch(
        'Checkpoint metadata does not match its materialization state hash',
      );
    }
    if (materialization.coordinate.ceiling !== null) {
      throw checkpointMaterializationMismatch(
        'Checkpoint materialization does not represent a live coordinate',
      );
    }
    return {
      bundleHandle,
      metadata,
      materialization,
      indexRoot: retainedRootHandle(materialization.roots.roaringIndexes),
      propertyRoot: retainedRootHandle(materialization.roots.properties),
    };
  }
}
