import CheckpointTailOpticSource, {
  type CheckpointTailCheckpointFrontier,
  type CheckpointTailPatchEntry,
} from './CheckpointTailOpticSource.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type BlobStoragePort from '../../../ports/BlobStoragePort.ts';
import type CommitMessageCodecPort from '../../../ports/CommitMessageCodecPort.ts';
import WarpError from '../../errors/WarpError.ts';
import type { CorePersistence } from '../../types/WarpPersistence.ts';

export type CoordinateCheckpointTailOpticSourceOptions = {
  readonly source: CheckpointTailOpticSource;
  readonly checkpointSha: string;
  readonly frontier: Map<string, string>;
};

export default class CoordinateCheckpointTailOpticSource extends CheckpointTailOpticSource {
  readonly graphName: string;
  readonly _persistence: CorePersistence;
  readonly _codec: CodecPort;
  readonly _blobStorage: BlobStoragePort | null;
  readonly _commitMessageCodec: CommitMessageCodecPort;
  private readonly _source: CheckpointTailOpticSource;
  private readonly _checkpointSha: string;
  private readonly _frontier: Map<string, string>;

  constructor(options: CoordinateCheckpointTailOpticSourceOptions) {
    super();
    assertSource(options.source);
    assertFrontier(options.frontier);
    this.graphName = options.source.graphName;
    this._persistence = options.source._persistence;
    this._codec = options.source._codec;
    this._blobStorage = options.source._blobStorage;
    this._commitMessageCodec = options.source._commitMessageCodec;
    this._source = options.source;
    assertNonEmpty(options.checkpointSha, 'checkpointSha');
    this._checkpointSha = options.checkpointSha;
    this._frontier = copyFrontier(options.frontier);
    Object.freeze(this);
  }

  discoverWriters(): Promise<string[]> {
    return Promise.resolve([...this._frontier.keys()].sort());
  }

  _readCheckpointSha(): Promise<string | null> {
    return Promise.resolve(this._checkpointSha);
  }

  async _loadPatchChainFromSha(
    tipSha: string,
    stopAtSha: string | null = null
  ): Promise<CheckpointTailPatchEntry[]> {
    return await this._source._loadPatchChainFromSha(tipSha, stopAtSha);
  }

  async _loadWriterPatches(
    writerId: string,
    stopAtSha: string | null = null
  ): Promise<CheckpointTailPatchEntry[]> {
    const coordinateTipSha = this._frontier.get(writerId);
    if (coordinateTipSha === undefined || coordinateTipSha === stopAtSha) {
      return [];
    }
    return await this._source._loadPatchChainFromSha(coordinateTipSha, stopAtSha);
  }

  async _validatePatchAgainstCheckpoint(
    writerId: string,
    incomingSha: string,
    checkpoint: CheckpointTailCheckpointFrontier | null | undefined
  ): Promise<void> {
    await this._source._validatePatchAgainstCheckpoint(writerId, incomingSha, checkpoint);
  }
}

function copyFrontier(frontier: Map<string, string>): Map<string, string> {
  const copy = new Map<string, string>();
  for (const [writerId, patchSha] of [...frontier.entries()].sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    assertNonEmpty(writerId, 'writerId');
    assertNonEmpty(patchSha, 'patchSha');
    copy.set(writerId, patchSha);
  }
  return copy;
}

function assertSource(source: CheckpointTailOpticSource): void {
  if (!hasSourceIdentity(source) || !hasSourcePorts(source) || !hasSourceMethods(source)) {
    throw new WarpError(
      'Coordinate checkpoint-tail optic source requires a checkpoint-tail source',
      'E_COORDINATE_CHECKPOINT_TAIL_OPTIC_SOURCE',
      { context: { field: 'source' } }
    );
  }
}

function hasSourceIdentity(source: CheckpointTailOpticSource): boolean {
  return typeof source.graphName === 'string' && source.graphName.trim().length > 0;
}

function hasSourcePorts(source: CheckpointTailOpticSource): boolean {
  return hasPersistencePort(source._persistence)
    && hasCodecPort(source._codec)
    && hasOptionalBlobStoragePort(source._blobStorage)
    && hasCommitMessageCodecPort(source._commitMessageCodec);
}

function hasSourceMethods(source: CheckpointTailOpticSource): boolean {
  const methodChecks = [
    typeof source.discoverWriters === 'function',
    typeof source._readCheckpointSha === 'function',
    typeof source._loadPatchChainFromSha === 'function',
    typeof source._loadWriterPatches === 'function',
    typeof source._validatePatchAgainstCheckpoint === 'function',
  ] as const;
  return methodChecks.every((methodExists) => methodExists);
}

function hasPersistencePort(persistence: CorePersistence): boolean {
  const methodChecks = [
    typeof persistence.showNode === 'function',
    typeof persistence.getNodeInfo === 'function',
    typeof persistence.readBlob === 'function',
    typeof persistence.readTreeOids === 'function',
    typeof persistence.readRef === 'function',
  ] as const;
  return methodChecks.every((methodExists) => methodExists);
}

function hasCodecPort(codec: CodecPort): boolean {
  const methodChecks = [
    typeof codec.encode === 'function',
    typeof codec.decode === 'function',
  ] as const;
  return methodChecks.every((methodExists) => methodExists);
}

function hasOptionalBlobStoragePort(blobStorage: BlobStoragePort | null): boolean {
  if (blobStorage === null) {
    return true;
  }
  const methodChecks = [
    typeof blobStorage.retrieve === 'function',
    typeof blobStorage.retrieveStream === 'function',
  ] as const;
  return methodChecks.every((methodExists) => methodExists);
}

function hasCommitMessageCodecPort(commitMessageCodec: CommitMessageCodecPort): boolean {
  const methodChecks = [
    typeof commitMessageCodec.decodeCheckpoint === 'function',
    typeof commitMessageCodec.decodePatch === 'function',
    typeof commitMessageCodec.detectKind === 'function',
  ] as const;
  return methodChecks.every((methodExists) => methodExists);
}

function assertFrontier(frontier: Map<string, string>): void {
  if (!(frontier instanceof Map)) {
    throw new WarpError(
      'Coordinate checkpoint-tail optic source requires a frontier Map',
      'E_COORDINATE_CHECKPOINT_TAIL_OPTIC_SOURCE',
      { context: { field: 'frontier' } }
    );
  }
}

function assertNonEmpty(value: string, field: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WarpError(
      'Coordinate checkpoint-tail optic source requires non-empty identity fields',
      'E_COORDINATE_CHECKPOINT_TAIL_OPTIC_SOURCE',
      { context: { field } }
    );
  }
}
