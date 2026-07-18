import type {
  BundleCapability,
  PublicationCapability,
} from '@git-stunts/git-cas';
import CheckpointStorePort, {
  type CheckpointBasis,
  type CheckpointData,
  type CheckpointMetadata,
  type CheckpointRecord,
  type PublishedCheckpoint,
} from '../../ports/CheckpointStorePort.ts';
import type AssetStoragePort from '../../ports/AssetStoragePort.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import {
  CHECKPOINT_STORAGE_FORMAT,
  type default as CommitMessageCodecPort,
} from '../../ports/CommitMessageCodecPort.ts';
import AssetHandle from '../../domain/storage/AssetHandle.ts';
import BundleHandle from '../../domain/storage/BundleHandle.ts';
import PersistenceError from '../../domain/errors/PersistenceError.ts';
import VersionVector from '../../domain/crdt/VersionVector.ts';
import { ProvenanceIndex } from '../../domain/services/provenance/ProvenanceIndex.ts';
import {
  deserializeCheckpointStateEnvelope,
  serializeCheckpointStateEnvelope,
  type CheckpointStateEnvelopeBuffers,
} from '../../domain/services/state/CheckpointSerializer.ts';
import {
  CURRENT_CHECKPOINT_SCHEMA,
  isCurrentCheckpointSchema,
} from '../../domain/services/state/checkpointHelpers.ts';
import { buildCheckpointRef, buildCoverageRef } from '../../domain/utils/RefLayout.ts';
import { collectAsyncIterable } from '../../domain/utils/streamUtils.ts';
import { adaptGitCasRetentionWitness } from './GitCasRetentionWitnessAdapter.ts';
import { stageCheckpointBundleArtifacts } from './CheckpointBundleArtifactStager.ts';
import LegacyCheckpointArtifactAdapter from './LegacyCheckpointArtifactAdapter.ts';
import { classifyCheckpointStorage } from './CheckpointStorageFormatClassifier.ts';
import { requireAdapterDependency } from './AdapterDependencyGuard.ts';

interface CheckpointHistory {
  readBlob(oid: string): Promise<Uint8Array>;
  readTreeOids(treeOid: string): Promise<Record<string, string>>;
  commitNode(options: { message: string; parents: string[] }): Promise<string>;
  showNode(sha: string): Promise<string>;
  getCommitTree(sha: string): Promise<string>;
  readRef(ref: string): Promise<string | null>;
  compareAndSwapRef(ref: string, newOid: string, expectedOid: string | null): Promise<void>;
}

export type GitCasCheckpointFacade = {
  readonly bundles: Pick<BundleCapability, 'putOrdered' | 'iterateMemberReferences'>;
  readonly publications: Pick<PublicationCapability, 'commit'>;
};

type CheckpointArtifact =
  | Readonly<{ kind: 'asset'; handle: AssetHandle }>
  | Readonly<{ kind: 'legacy-object'; oid: string }>;

type CheckpointLayout = {
  readonly metadata: ReturnType<CommitMessageCodecPort['decodeCheckpoint']>;
  readonly artifacts: Readonly<Record<string, CheckpointArtifact>>;
  readonly indexShardHandles: Readonly<Record<string, AssetHandle>>;
};

/**
 * Publishes current checkpoints as retained git-cas bundles and reads the
 * retired schema-5 Git tree layout behind an explicit adapter boundary.
 */
export class CborCheckpointStoreAdapter extends CheckpointStorePort {
  private readonly _codec: CodecPort;
  private readonly _messageCodec: CommitMessageCodecPort;
  private readonly _history: CheckpointHistory;
  private readonly _assets: AssetStoragePort;
  private readonly _cas: GitCasCheckpointFacade;
  private readonly _legacyArtifacts: LegacyCheckpointArtifactAdapter;

  constructor(options: {
    codec: CodecPort;
    commitMessageCodec: CommitMessageCodecPort;
    history: CheckpointHistory;
    assetStorage: AssetStoragePort;
    cas: GitCasCheckpointFacade;
  }) {
    super();
    requireAdapterDependency(options.codec, 'codec');
    requireAdapterDependency(options.commitMessageCodec, 'commitMessageCodec');
    requireAdapterDependency(options.history, 'history');
    requireAdapterDependency(options.assetStorage, 'assetStorage');
    requireAdapterDependency(options.cas, 'cas');
    this._codec = options.codec;
    this._messageCodec = options.commitMessageCodec;
    this._history = options.history;
    this._assets = options.assetStorage;
    this._cas = options.cas;
    this._legacyArtifacts = new LegacyCheckpointArtifactAdapter({
      history: options.history,
      assets: options.assetStorage,
    });
  }

  override async publishCheckpoint(record: CheckpointRecord): Promise<PublishedCheckpoint> {
    const checkpointRef = buildCheckpointRef(record.graphName);
    const expectedHead = record.expectedCheckpointSha === undefined
      ? await this._history.readRef(checkpointRef)
      : record.expectedCheckpointSha;
    const stateEnvelope = serializeCheckpointStateEnvelope(record.state, { codec: this._codec });
    const bundle = await this._cas.bundles.putOrdered({
      members: stageCheckpointBundleArtifacts({
        assets: this._assets,
        codec: this._codec,
        envelope: stateEnvelope,
        record,
      }),
    });
    const bundleHandle = new BundleHandle(bundle.handle.toString());
    const message = this._messageCodec.encodeCheckpoint({
      kind: 'checkpoint',
      graph: record.graphName,
      stateHash: record.stateHash,
      schema: CURRENT_CHECKPOINT_SCHEMA,
      checkpointVersion: CHECKPOINT_STORAGE_FORMAT,
      bundleHandle,
    });
    const publication = await this._cas.publications.commit({
      root: bundle.handle,
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
    return await this._history.readRef(buildCheckpointRef(graphName));
  }

  override async loadCheckpoint(
    checkpointSha: string,
    expectedGraphName?: string,
  ): Promise<CheckpointData> {
    const layout = await this._readLayout(checkpointSha, expectedGraphName);
    const state = deserializeCheckpointStateEnvelope(
      await this._readStateEnvelope(checkpointSha, layout.artifacts),
      { codec: this._codec },
    );
    const frontier = await this._readFrontier(checkpointSha, layout.artifacts);
    const appliedVV = await this._readAppliedVV(layout.artifacts);
    const provenanceIndex = await this._readProvenanceIndex(layout.artifacts);
    const result: CheckpointData = {
      state,
      frontier,
      stateHash: layout.metadata.stateHash,
      schema: layout.metadata.schema,
      appliedVV,
      indexShardHandles: hasEntries(layout.indexShardHandles)
        ? layout.indexShardHandles
        : null,
    };
    if (provenanceIndex !== null) {
      result.provenanceIndex = provenanceIndex;
    }
    return result;
  }

  override async readMetadata(
    checkpointSha: string,
    expectedGraphName?: string,
  ): Promise<CheckpointMetadata> {
    const metadata = this._messageCodec.decodeCheckpoint(
      await this._history.showNode(checkpointSha),
    );
    requireCheckpointGraph(checkpointSha, metadata.graph, expectedGraphName);
    if (!isCurrentCheckpointSchema(metadata.schema)) {
      throw unsupportedCheckpointSchema(checkpointSha, metadata.schema);
    }
    classifyCheckpointStorage(checkpointSha, metadata);
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
    const layout = await this._readLayout(checkpointSha, expectedGraphName);
    if (!hasEntries(layout.indexShardHandles)) {
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
      frontier: await this._readFrontier(checkpointSha, layout.artifacts),
      indexShardHandles: layout.indexShardHandles,
    });
  }

  override async publishCoverage(options: {
    graphName: string;
    parents: string[];
  }): Promise<string> {
    const ref = buildCoverageRef(options.graphName);
    const expectedHead = await this._history.readRef(ref);
    const message = this._messageCodec.encodeAnchor({
      kind: 'anchor',
      graph: options.graphName,
      schema: 2,
    });
    const sha = await this._history.commitNode({ message, parents: options.parents });
    await this._history.compareAndSwapRef(ref, sha, expectedHead);
    return sha;
  }

  private async _readLayout(
    checkpointSha: string,
    expectedGraphName?: string,
  ): Promise<CheckpointLayout> {
    const metadata = this._messageCodec.decodeCheckpoint(
      await this._history.showNode(checkpointSha),
    );
    requireCheckpointGraph(checkpointSha, metadata.graph, expectedGraphName);
    if (!isCurrentCheckpointSchema(metadata.schema)) {
      throw unsupportedCheckpointSchema(checkpointSha, metadata.schema);
    }
    const storage = classifyCheckpointStorage(checkpointSha, metadata);
    if (storage.kind === 'bundle') {
      return await this._readBundleLayout(metadata, storage.handle);
    }
    const rawTreeOids = await this._history.readTreeOids(
      await this._history.getCommitTree(checkpointSha),
    );
    const treeOids = await this._expandLegacyStateTree(rawTreeOids);
    const indexOids = await this._readLegacyIndexOids(treeOids, rawTreeOids);
    const artifacts = Object.fromEntries(
      Object.entries(treeOids).map(([path, oid]) => [
        path,
        legacyCheckpointArtifact(oid),
      ]),
    );
    return {
      metadata,
      artifacts: Object.freeze(artifacts),
      indexShardHandles: Object.freeze(Object.fromEntries(
        Object.entries(indexOids).map(([path, oid]) => [path, new AssetHandle(oid)]),
      )),
    };
  }

  private async _readBundleLayout(
    metadata: CheckpointLayout['metadata'],
    bundleHandle: BundleHandle,
  ): Promise<CheckpointLayout> {
    const artifacts = new Map<string, CheckpointArtifact>();
    const indexShardHandles = new Map<string, AssetHandle>();
    for await (const member of this._cas.bundles.iterateMemberReferences({
      handle: bundleHandle.toString(),
    })) {
      if (member.handle.kind !== 'asset') {
        throw new PersistenceError(
          `Checkpoint bundle member is not an asset: ${member.path}`,
          'E_CHECKPOINT_INVALID_BUNDLE_MEMBER',
          { context: { path: member.path, kind: member.handle.kind } },
        );
      }
      if (artifacts.has(member.path)) {
        throw new PersistenceError(
          `Checkpoint bundle contains a duplicate member: ${member.path}`,
          'E_CHECKPOINT_DUPLICATE_BUNDLE_MEMBER',
          { context: { path: member.path } },
        );
      }
      const handle = new AssetHandle(member.handle.toString());
      artifacts.set(member.path, Object.freeze({ kind: 'asset', handle }));
      if (member.path.startsWith('index/')) {
        const indexPath = member.path.slice('index/'.length);
        if (indexPath.length === 0) {
          throw new PersistenceError(
            'Checkpoint bundle contains an empty index member path',
            'E_CHECKPOINT_INVALID_BUNDLE_MEMBER',
            { context: { path: member.path } },
          );
        }
        indexShardHandles.set(indexPath, handle);
      }
    }
    return {
      metadata,
      artifacts: Object.freeze(Object.fromEntries(artifacts)),
      indexShardHandles: Object.freeze(Object.fromEntries(indexShardHandles)),
    };
  }

  private async _expandLegacyStateTree(
    treeOids: Record<string, string>,
  ): Promise<Record<string, string>> {
    if (treeOids['state/nodeAlive'] !== undefined || treeOids['state'] === undefined) {
      return treeOids;
    }
    const expanded = { ...treeOids };
    for (const [path, oid] of Object.entries(
      await this._history.readTreeOids(treeOids['state']),
    )) {
      expanded[`state/${path}`] = oid;
    }
    return expanded;
  }

  private async _readLegacyIndexOids(
    treeOids: Record<string, string>,
    rawTreeOids: Record<string, string>,
  ): Promise<Record<string, string>> {
    const flattened = Object.fromEntries(
      Object.entries(rawTreeOids)
        .filter(([path]) => path.startsWith('index/'))
        .map(([path, oid]) => [path.slice('index/'.length), oid]),
    );
    if (hasEntries(flattened) || treeOids['index'] === undefined) {
      return flattened;
    }
    return await this._history.readTreeOids(treeOids['index']);
  }

  private async _readStateEnvelope(
    checkpointSha: string,
    artifacts: Readonly<Record<string, CheckpointArtifact>>,
  ): Promise<CheckpointStateEnvelopeBuffers> {
    return {
      nodeAlive: await this._readPayload(requireArtifact(checkpointSha, artifacts, 'state/nodeAlive')),
      edgeAlive: await this._readPayload(requireArtifact(checkpointSha, artifacts, 'state/edgeAlive')),
      prop: await this._readPayload(requireArtifact(checkpointSha, artifacts, 'state/prop.cbor')),
      observedFrontier: await this._readPayload(
        requireArtifact(checkpointSha, artifacts, 'state/observedFrontier.cbor'),
      ),
      edgeBirthEvent: await this._readPayload(
        requireArtifact(checkpointSha, artifacts, 'state/edgeBirthEvent.cbor'),
      ),
    };
  }

  private async _readFrontier(
    checkpointSha: string,
    artifacts: Readonly<Record<string, CheckpointArtifact>>,
  ): Promise<Map<string, string>> {
    const bytes = await this._readPayload(
      requireArtifact(checkpointSha, artifacts, 'frontier.cbor'),
    );
    return decodeFrontier(this._codec.decode(bytes), checkpointSha);
  }

  private async _readAppliedVV(
    artifacts: Readonly<Record<string, CheckpointArtifact>>,
  ): Promise<VersionVector | null> {
    const artifact = artifacts['appliedVV.cbor'];
    if (artifact === undefined) {
      return null;
    }
    return VersionVector.from(
      this._codec.decode<Record<string, number>>(await this._readPayload(artifact)),
    );
  }

  private async _readProvenanceIndex(
    artifacts: Readonly<Record<string, CheckpointArtifact>>,
  ): Promise<ProvenanceIndex | null> {
    const artifact = artifacts['provenanceIndex.cbor'];
    if (artifact === undefined) {
      return null;
    }
    return ProvenanceIndex.deserialize(await this._readPayload(artifact), { codec: this._codec });
  }

  private async _readPayload(artifact: CheckpointArtifact): Promise<Uint8Array> {
    if (artifact.kind === 'asset') {
      return await collectAsyncIterable(this._assets.open(artifact.handle));
    }
    return await this._legacyArtifacts.read(artifact.oid);
  }

}

function legacyCheckpointArtifact(oid: string): CheckpointArtifact {
  return Object.freeze({ kind: 'legacy-object', oid });
}

function requireArtifact(
  checkpointSha: string,
  artifacts: Readonly<Record<string, CheckpointArtifact>>,
  path: string,
): CheckpointArtifact {
  const artifact = artifacts[path];
  if (artifact !== undefined) {
    return artifact;
  }
  throw new PersistenceError(
    `Checkpoint ${checkpointSha} missing ${path}`,
    'E_CHECKPOINT_MISSING_ARTIFACT',
    { context: { checkpointSha, path } },
  );
}

function requirePublishedBundle(publishedToken: string, expected: BundleHandle): void {
  if (publishedToken !== expected.toString()) {
    throw new PersistenceError(
      'Checkpoint publication returned a different bundle handle',
      'E_CHECKPOINT_PUBLICATION_MISMATCH',
      { context: { expected: expected.toString(), actual: publishedToken } },
    );
  }
}

function requireRetainedBundle(retainedToken: string, expected: BundleHandle): void {
  if (retainedToken !== expected.toString()) {
    throw new PersistenceError(
      'Checkpoint retention evidence names a different bundle handle',
      'E_CHECKPOINT_RETENTION_MISMATCH',
      { context: { expected: expected.toString(), actual: retainedToken } },
    );
  }
}

function unsupportedCheckpointSchema(checkpointSha: string, schema: number): PersistenceError {
  return new PersistenceError(
    `Checkpoint ${checkpointSha} is schema:${schema}. `
      + `Only schema:${CURRENT_CHECKPOINT_SCHEMA} checkpoints are supported by the shipped runtime. `
      + 'Run `npm run upgrade -- --graph <name>` before loading this graph.',
    'E_CHECKPOINT_UNSUPPORTED_SCHEMA',
    { context: { checkpointSha, schema } },
  );
}

function requireCheckpointGraph(
  checkpointSha: string,
  actualGraphName: string,
  expectedGraphName: string | undefined,
): void {
  if (expectedGraphName === undefined || actualGraphName === expectedGraphName) {
    return;
  }
  throw new PersistenceError(
    `Checkpoint ${checkpointSha} belongs to graph ${actualGraphName}, not ${expectedGraphName}`,
    'E_CHECKPOINT_GRAPH_MISMATCH',
    { context: { checkpointSha, actualGraphName, expectedGraphName } },
  );
}

function hasEntries(record: Readonly<Record<string, unknown>>): boolean {
  return Object.keys(record).length > 0;
}

function decodeFrontier(value: unknown, checkpointSha: string): Map<string, string> {
  if (value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || !isRecordPrototype(Object.getPrototypeOf(value))) {
    throw invalidFrontier(checkpointSha);
  }
  const frontier = new Map<string, string>();
  for (const [writerId, sha] of Object.entries(value)) {
    if (writerId.length === 0 || typeof sha !== 'string' || sha.length === 0) {
      throw invalidFrontier(checkpointSha);
    }
    frontier.set(writerId, sha);
  }
  return frontier;
}

function isRecordPrototype(value: object | null): boolean {
  return value === Object.prototype || value === null;
}

function invalidFrontier(checkpointSha: string): PersistenceError {
  return new PersistenceError(
    `Checkpoint ${checkpointSha} has an invalid frontier`,
    'E_CHECKPOINT_INVALID_FRONTIER',
    { context: { checkpointSha } },
  );
}
