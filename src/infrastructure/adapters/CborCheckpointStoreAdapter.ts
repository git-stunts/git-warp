import CheckpointStorePort, {
  type CheckpointBasis,
  type CheckpointData,
  type CheckpointMetadata,
  type CheckpointRecord,
  type PublishedCheckpoint,
} from '../../ports/CheckpointStorePort.ts';
import type AssetStoragePort from '../../ports/AssetStoragePort.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type CommitMessageCodecPort from '../../ports/CommitMessageCodecPort.ts';
import AssetHandle from '../../domain/storage/AssetHandle.ts';
import WarpError from '../../domain/errors/WarpError.ts';
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
import { textDecode, textEncode } from '../../domain/utils/bytes.ts';

interface CheckpointHistory {
  writeBlob(content: Uint8Array | string): Promise<string>;
  readBlob(oid: string): Promise<Uint8Array>;
  writeTree(entries: string[]): Promise<string>;
  readTreeOids(treeOid: string): Promise<Record<string, string>>;
  commitNode(options: { message: string; parents: string[] }): Promise<string>;
  commitNodeWithTree(options: {
    treeOid: string;
    parents: string[];
    message: string;
  }): Promise<string>;
  showNode(sha: string): Promise<string>;
  getCommitTree(sha: string): Promise<string>;
  readRef(ref: string): Promise<string | null>;
  compareAndSwapRef(ref: string, newOid: string, expectedOid: string | null): Promise<void>;
}

type CheckpointLayout = {
  readonly metadata: ReturnType<CommitMessageCodecPort['decodeCheckpoint']>;
  readonly treeOids: Record<string, string>;
  readonly indexShardHandles: Readonly<Record<string, AssetHandle>>;
};

const CAS_POINTER_PREFIX = 'git-warp:cas-pointer:v1:';
const CAS_POINTER_PREFIX_BYTES = textEncode(CAS_POINTER_PREFIX);

/**
 * Compatibility adapter for the schema-5 checkpoint tree.
 *
 * Raw Git layout is deliberately confined here. The checkpoint/index page
 * migration can replace this adapter without changing domain services.
 */
export class CborCheckpointStoreAdapter extends CheckpointStorePort {
  private readonly _codec: CodecPort;
  private readonly _messageCodec: CommitMessageCodecPort;
  private readonly _history: CheckpointHistory;
  private readonly _assets: AssetStoragePort;

  constructor(options: {
    codec: CodecPort;
    commitMessageCodec: CommitMessageCodecPort;
    history: CheckpointHistory;
    assetStorage: AssetStoragePort;
  }) {
    super();
    requireDependency(options.codec, 'codec');
    requireDependency(options.commitMessageCodec, 'commitMessageCodec');
    requireDependency(options.history, 'history');
    requireDependency(options.assetStorage, 'assetStorage');
    this._codec = options.codec;
    this._messageCodec = options.commitMessageCodec;
    this._history = options.history;
    this._assets = options.assetStorage;
  }

  override async publishCheckpoint(record: CheckpointRecord): Promise<PublishedCheckpoint> {
    const checkpointRef = buildCheckpointRef(record.graphName);
    const expectedHead = await this._history.readRef(checkpointRef);
    const stateEnvelope = serializeCheckpointStateEnvelope(record.state, { codec: this._codec });
    const stateTreeOid = await this._writeStateTree(stateEnvelope);
    const frontierOid = await this._history.writeBlob(this._encodeFrontier(record.frontier));
    const appliedVVOid = await this._history.writeBlob(
      this._codec.encode(VersionVector.serialize(record.appliedVV)),
    );
    const provenanceOid = record.provenanceIndex === null || record.provenanceIndex === undefined
      ? null
      : await this._history.writeBlob(record.provenanceIndex.serialize({ codec: this._codec }));
    const indexTreeOid = record.indexShards === null || record.indexShards === undefined
      ? null
      : await this._writeIndexTree(record.indexShards);

    const entries = [
      `100644 blob ${appliedVVOid}\tappliedVV.cbor`,
      `100644 blob ${frontierOid}\tfrontier.cbor`,
      `040000 tree ${stateTreeOid}\tstate`,
    ];
    if (provenanceOid !== null) {
      entries.push(`100644 blob ${provenanceOid}\tprovenanceIndex.cbor`);
    }
    if (indexTreeOid !== null) {
      entries.push(`040000 tree ${indexTreeOid}\tindex`);
    }
    entries.sort(compareTreeEntriesByPath);
    const rootTreeOid = await this._history.writeTree(entries);
    const message = this._messageCodec.encodeCheckpoint({
      kind: 'checkpoint',
      graph: record.graphName,
      stateHash: record.stateHash,
      schema: CURRENT_CHECKPOINT_SCHEMA,
      checkpointVersion: null,
    });
    const checkpointSha = await this._history.commitNodeWithTree({
      treeOid: rootTreeOid,
      parents: record.parents,
      message,
    });
    await this._history.compareAndSwapRef(checkpointRef, checkpointSha, expectedHead);
    return Object.freeze({ checkpointSha });
  }

  override async resolveHead(graphName: string): Promise<string | null> {
    return await this._history.readRef(buildCheckpointRef(graphName));
  }

  override async loadCheckpoint(checkpointSha: string): Promise<CheckpointData> {
    const layout = await this._readLayout(checkpointSha);
    const state = deserializeCheckpointStateEnvelope(
      await this._readStateEnvelope(checkpointSha, layout.treeOids),
      { codec: this._codec },
    );
    const frontier = await this._readFrontier(checkpointSha, layout.treeOids);
    const appliedVV = await this._readAppliedVV(layout.treeOids);
    const provenanceIndex = await this._readProvenanceIndex(layout.treeOids);
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

  override async readMetadata(checkpointSha: string): Promise<CheckpointMetadata> {
    const metadata = this._messageCodec.decodeCheckpoint(
      await this._history.showNode(checkpointSha),
    );
    if (!isCurrentCheckpointSchema(metadata.schema)) {
      throw unsupportedCheckpointSchema(checkpointSha, metadata.schema);
    }
    return Object.freeze({
      checkpointSha,
      stateHash: metadata.stateHash,
      schema: metadata.schema,
    });
  }

  override async loadBasis(checkpointSha: string): Promise<CheckpointBasis> {
    const layout = await this._readLayout(checkpointSha);
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
      frontier: await this._readFrontier(checkpointSha, layout.treeOids),
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

  private async _readLayout(checkpointSha: string): Promise<CheckpointLayout> {
    const metadata = this._messageCodec.decodeCheckpoint(
      await this._history.showNode(checkpointSha),
    );
    if (!isCurrentCheckpointSchema(metadata.schema)) {
      throw unsupportedCheckpointSchema(checkpointSha, metadata.schema);
    }
    const rawTreeOids = await this._history.readTreeOids(
      await this._history.getCommitTree(checkpointSha),
    );
    const treeOids = await this._expandStateTree(rawTreeOids);
    const indexOids = await this._readIndexOids(treeOids, rawTreeOids);
    return {
      metadata,
      treeOids,
      indexShardHandles: Object.freeze(Object.fromEntries(
        Object.entries(indexOids).map(([path, oid]) => [path, new AssetHandle(oid)]),
      )),
    };
  }

  private async _expandStateTree(
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

  private async _readIndexOids(
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
    treeOids: Record<string, string>,
  ): Promise<CheckpointStateEnvelopeBuffers> {
    return {
      nodeAlive: await this._readPayload(requireArtifact(checkpointSha, treeOids, 'state/nodeAlive')),
      edgeAlive: await this._readPayload(requireArtifact(checkpointSha, treeOids, 'state/edgeAlive')),
      prop: await this._readPayload(requireArtifact(checkpointSha, treeOids, 'state/prop.cbor')),
      observedFrontier: await this._readPayload(
        requireArtifact(checkpointSha, treeOids, 'state/observedFrontier.cbor'),
      ),
      edgeBirthEvent: await this._readPayload(
        requireArtifact(checkpointSha, treeOids, 'state/edgeBirthEvent.cbor'),
      ),
    };
  }

  private async _readFrontier(
    checkpointSha: string,
    treeOids: Record<string, string>,
  ): Promise<Map<string, string>> {
    const bytes = await this._readPayload(
      requireArtifact(checkpointSha, treeOids, 'frontier.cbor'),
    );
    return decodeFrontier(this._codec.decode(bytes), checkpointSha);
  }

  private async _readAppliedVV(treeOids: Record<string, string>): Promise<VersionVector | null> {
    const oid = treeOids['appliedVV.cbor'];
    if (oid === undefined) {
      return null;
    }
    return VersionVector.from(
      this._codec.decode<Record<string, number>>(await this._readPayload(oid)),
    );
  }

  private async _readProvenanceIndex(
    treeOids: Record<string, string>,
  ): Promise<ProvenanceIndex | null> {
    const oid = treeOids['provenanceIndex.cbor'];
    if (oid === undefined) {
      return null;
    }
    return ProvenanceIndex.deserialize(await this._readPayload(oid), { codec: this._codec });
  }

  private async _readPayload(oid: string): Promise<Uint8Array> {
    const bytes = await this._history.readBlob(oid);
    const assetToken = decodeLegacyCasPointer(bytes);
    if (assetToken === null) {
      return bytes;
    }
    return await collectAsyncIterable(this._assets.open(new AssetHandle(assetToken)));
  }

  private async _writeStateTree(envelope: CheckpointStateEnvelopeBuffers): Promise<string> {
    const [nodeAlive, edgeAlive, prop, observedFrontier, edgeBirthEvent] = await Promise.all([
      this._history.writeBlob(envelope.nodeAlive),
      this._history.writeBlob(envelope.edgeAlive),
      this._history.writeBlob(envelope.prop),
      this._history.writeBlob(envelope.observedFrontier),
      this._history.writeBlob(envelope.edgeBirthEvent),
    ]);
    const entries = [
      `100644 blob ${edgeAlive}\tedgeAlive`,
      `100644 blob ${edgeBirthEvent}\tedgeBirthEvent.cbor`,
      `100644 blob ${nodeAlive}\tnodeAlive`,
      `100644 blob ${observedFrontier}\tobservedFrontier.cbor`,
      `100644 blob ${prop}\tprop.cbor`,
    ];
    entries.sort(compareTreeEntriesByPath);
    return await this._history.writeTree(entries);
  }

  private async _writeIndexTree(
    indexShards: Readonly<Record<string, Uint8Array>>,
  ): Promise<string> {
    const entries: string[] = [];
    for (const path of Object.keys(indexShards).sort()) {
      const bytes = indexShards[path];
      if (bytes === undefined) {
        throw new WarpError(
          `Missing index shard for path: ${path}`,
          'E_CHECKPOINT_MISSING_INDEX_SHARD',
        );
      }
      entries.push(`100644 blob ${await this._history.writeBlob(bytes)}\t${path}`);
    }
    return await this._history.writeTree(entries);
  }

  private _encodeFrontier(frontier: Map<string, string>): Uint8Array {
    return this._codec.encode(Object.fromEntries([...frontier.entries()].sort(([left], [right]) =>
      left.localeCompare(right)
    )));
  }
}

function compareTreeEntriesByPath(left: string, right: string): number {
  const leftPath = left.slice(left.indexOf('\t') + 1);
  const rightPath = right.slice(right.indexOf('\t') + 1);
  return leftPath.localeCompare(rightPath);
}

function requireArtifact(
  checkpointSha: string,
  treeOids: Record<string, string>,
  path: string,
): string {
  const oid = treeOids[path];
  if (oid !== undefined) {
    return oid;
  }
  throw new PersistenceError(
    `Checkpoint ${checkpointSha} missing ${path}`,
    'E_CHECKPOINT_MISSING_ARTIFACT',
    { context: { checkpointSha, path } },
  );
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

function decodeLegacyCasPointer(bytes: Uint8Array): string | null {
  if (bytes.length < CAS_POINTER_PREFIX_BYTES.length) {
    return null;
  }
  for (let index = 0; index < CAS_POINTER_PREFIX_BYTES.length; index += 1) {
    if (bytes[index] !== CAS_POINTER_PREFIX_BYTES[index]) {
      return null;
    }
  }
  const token = textDecode(bytes).slice(CAS_POINTER_PREFIX.length);
  if (token.length === 0) {
    throw new PersistenceError(
      'Legacy checkpoint CAS pointer is empty',
      'E_CHECKPOINT_EMPTY_CAS_POINTER',
    );
  }
  return token;
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

function requireDependency(value: unknown, name: string): void {
  if (value === null || value === undefined) {
    throw new WarpError(
      `CborCheckpointStoreAdapter requires ${name}`,
      'E_INVALID_DEPENDENCY',
    );
  }
}
