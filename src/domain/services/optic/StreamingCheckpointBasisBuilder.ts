import type BlobPort from '../../../ports/BlobPort.ts';
import type CodecPort from '../../../ports/CodecPort.ts';
import type TreePort from '../../../ports/TreePort.ts';
import QueryError from '../../errors/QueryError.ts';
import defaultCodec from '../../utils/defaultCodec.ts';
import { CheckpointBasisFact, type CheckpointBasisFactShardFamily } from './CheckpointBasisFact.ts';
import CheckpointBasisManifest, {
  CheckpointBasisChunking,
  CheckpointBasisCompleteness,
  CheckpointBasisShardGeometry,
  CheckpointBasisShardRootMap,
  CheckpointBasisSupportPosture,
} from './CheckpointBasisManifest.ts';

export type CheckpointBasisPublicationStorage =
  Pick<BlobPort, 'writeBlob'> & Pick<TreePort, 'writeTree'>;

export type StreamingCheckpointBasisBuilderOptions = {
  readonly graphName: string;
  readonly checkpointSha: string;
  readonly frontier: Map<string, string>;
  readonly storage: CheckpointBasisPublicationStorage;
  readonly codec?: CodecPort;
  readonly maxFactsPerShard: number;
  readonly layoutFamily?: string;
  readonly payloadLayout?: string;
  readonly shardKeyStrategy?: string;
};

export class StreamingCheckpointBasisBuildResult {
  readonly manifest: CheckpointBasisManifest;
  readonly rootTreeOid: string;
  readonly flushCount: number;
  readonly shardWriteCount: number;
  readonly treeEntries: readonly string[];

  constructor(options: {
    readonly manifest: CheckpointBasisManifest;
    readonly rootTreeOid: string;
    readonly flushCount: number;
    readonly shardWriteCount: number;
    readonly treeEntries: readonly string[];
  }) {
    this.manifest = options.manifest;
    this.rootTreeOid = options.rootTreeOid;
    this.flushCount = options.flushCount;
    this.shardWriteCount = options.shardWriteCount;
    this.treeEntries = Object.freeze([...options.treeEntries]);
    Object.freeze(this);
  }
}

export default class StreamingCheckpointBasisBuilder {
  private readonly _graphName: string;
  private readonly _checkpointSha: string;
  private readonly _frontier: Map<string, string>;
  private readonly _storage: CheckpointBasisPublicationStorage;
  private readonly _codec: CodecPort;
  private readonly _maxFactsPerShard: number;
  private readonly _layoutFamily: string;
  private readonly _payloadLayout: string;
  private readonly _shardKeyStrategy: string;

  constructor(options: StreamingCheckpointBasisBuilderOptions) {
    validateText(options.graphName, 'graphName');
    validateText(options.checkpointSha, 'checkpointSha');
    validateFrontier(options.frontier);
    validateStorage(options.storage);
    this._graphName = options.graphName;
    this._checkpointSha = options.checkpointSha;
    this._frontier = copyFrontier(options.frontier);
    this._storage = options.storage;
    this._codec = options.codec ?? defaultCodec;
    this._maxFactsPerShard = validatePositiveInteger(options.maxFactsPerShard, 'maxFactsPerShard');
    this._layoutFamily = options.layoutFamily ?? 'checkpoint-basis-shards';
    this._payloadLayout = options.payloadLayout ?? 'basis-facts-v1';
    this._shardKeyStrategy = options.shardKeyStrategy ?? 'hex-prefix-2';
    Object.freeze(this);
  }

  async build(facts: AsyncIterable<CheckpointBasisFact>): Promise<StreamingCheckpointBasisBuildResult> {
    validateFactStream(facts);
    const publication = new CheckpointBasisPublication({ maxFactsPerShard: this._maxFactsPerShard });
    for await (const fact of facts) {
      await publication.addFact(fact, this._storage, this._codec);
    }
    await publication.flushAll(this._storage, this._codec);
    const treeEntries = publication.treeEntries();
    const rootTreeOid = await this._storage.writeTree([...treeEntries]);
    return new StreamingCheckpointBasisBuildResult({
      manifest: this._manifest(publication, rootTreeOid),
      rootTreeOid,
      flushCount: publication.flushCount,
      shardWriteCount: publication.shardWriteCount,
      treeEntries,
    });
  }

  private _manifest(
    publication: CheckpointBasisPublication,
    rootTreeOid: string,
  ): CheckpointBasisManifest {
    const shardCount = Math.max(1, publication.shardWriteCount);
    const chunkCount = Math.max(1, publication.flushCount);
    return new CheckpointBasisManifest({
      graphName: this._graphName,
      checkpointSha: this._checkpointSha,
      frontier: this._frontier,
      appliedVersionVector: appliedVersionVectorFromFrontier(this._frontier),
      basisIdentity: `basis:${this._graphName}:${this._checkpointSha}:${rootTreeOid}`,
      semanticReadingIdentity: `reading-basis:${this._graphName}:${this._checkpointSha}:streamed-facts-v1`,
      livenessRoots: publication.rootMap('node-liveness'),
      propertyRoots: publication.rootMap('node-property'),
      outgoingAdjacencyRoots: publication.rootMap('outgoing-adjacency'),
      incomingAdjacencyRoots: publication.rootMap('incoming-adjacency'),
      edgeFactRoots: publication.rootMap('edge-fact'),
      provenancePosture: publication.hasFamily('provenance')
        ? CheckpointBasisSupportPosture.present(`tree:${rootTreeOid}:provenance`)
        : CheckpointBasisSupportPosture.unavailable('no-provenance-facts'),
      contentAnchorPosture: publication.hasFamily('content-anchor')
        ? CheckpointBasisSupportPosture.present(`tree:${rootTreeOid}:content-anchor`)
        : CheckpointBasisSupportPosture.unavailable('no-content-anchor-facts'),
      shardGeometry: new CheckpointBasisShardGeometry({
        layoutFamily: this._layoutFamily,
        payloadLayout: this._payloadLayout,
        shardKeyStrategy: this._shardKeyStrategy,
        shardCount,
      }),
      chunking: new CheckpointBasisChunking({
        maxFactsPerShard: this._maxFactsPerShard,
        chunkCount,
      }),
      completeness: publication.shardWriteCount > 0
        ? CheckpointBasisCompleteness.complete()
        : CheckpointBasisCompleteness.partial('empty-fact-stream'),
    });
  }
}

class CheckpointBasisPublication {
  private readonly _maxFactsPerShard: number;
  private readonly _pending: Map<string, CheckpointBasisPendingShard>;
  private readonly _chunkIndexes: Map<string, number>;
  private readonly _treeEntries: string[];
  private readonly _livenessRoots: Map<string, string>;
  private readonly _propertyRoots: Map<string, string>;
  private readonly _outgoingAdjacencyRoots: Map<string, string>;
  private readonly _incomingAdjacencyRoots: Map<string, string>;
  private readonly _edgeFactRoots: Map<string, string>;
  private readonly _provenanceRoots: Map<string, string>;
  private readonly _contentAnchorRoots: Map<string, string>;
  flushCount: number;
  shardWriteCount: number;

  constructor(options: { readonly maxFactsPerShard: number }) {
    this._maxFactsPerShard = options.maxFactsPerShard;
    this._pending = new Map();
    this._chunkIndexes = new Map();
    this._treeEntries = [];
    this._livenessRoots = new Map();
    this._propertyRoots = new Map();
    this._outgoingAdjacencyRoots = new Map();
    this._incomingAdjacencyRoots = new Map();
    this._edgeFactRoots = new Map();
    this._provenanceRoots = new Map();
    this._contentAnchorRoots = new Map();
    this.flushCount = 0;
    this.shardWriteCount = 0;
  }

  async addFact(
    fact: CheckpointBasisFact,
    storage: CheckpointBasisPublicationStorage,
    codec: CodecPort,
  ): Promise<void> {
    validateFact(fact);
    const pendingShard = this._pendingShard(fact);
    pendingShard.add(fact);
    if (pendingShard.size >= this._maxFactsPerShard) {
      await this._flush(pendingShard, storage, codec);
    }
  }

  async flushAll(
    storage: CheckpointBasisPublicationStorage,
    codec: CodecPort,
  ): Promise<void> {
    for (const pendingShard of this._pending.values()) {
      if (pendingShard.size > 0) {
        await this._flush(pendingShard, storage, codec);
      }
    }
  }

  rootMap(family: 'node-liveness'): CheckpointBasisShardRootMap;
  rootMap(family: 'node-property'): CheckpointBasisShardRootMap;
  rootMap(family: 'outgoing-adjacency'): CheckpointBasisShardRootMap;
  rootMap(family: 'incoming-adjacency'): CheckpointBasisShardRootMap;
  rootMap(family: 'edge-fact'): CheckpointBasisShardRootMap;
  rootMap(family: CheckpointBasisFactShardFamily): CheckpointBasisShardRootMap {
    return new CheckpointBasisShardRootMap({
      family: manifestRootFamily(family),
      roots: this._rootsForFamily(family),
    });
  }

  hasFamily(family: 'provenance' | 'content-anchor'): boolean {
    return this._rootsForFamily(family).size > 0;
  }

  treeEntries(): readonly string[] {
    return Object.freeze([...this._treeEntries].sort(compareTreeEntries));
  }

  private _pendingShard(fact: CheckpointBasisFact): CheckpointBasisPendingShard {
    const family = fact.shardFamily();
    const basePath = fact.shardPath();
    const pendingKey = `${family}/${basePath}`;
    const existing = this._pending.get(pendingKey);
    if (existing !== undefined) {
      return existing;
    }
    const created = new CheckpointBasisPendingShard({ family, basePath, pendingKey });
    this._pending.set(pendingKey, created);
    return created;
  }

  private async _flush(
    pendingShard: CheckpointBasisPendingShard,
    storage: CheckpointBasisPublicationStorage,
    codec: CodecPort,
  ): Promise<void> {
    const facts = pendingShard.takeSortedFacts();
    if (facts.length === 0) {
      return;
    }
    const nextChunkIndex = this._nextChunkIndex(pendingShard.pendingKey);
    const chunkPath = chunkedPath(pendingShard.family, pendingShard.basePath, nextChunkIndex);
    const oid = await storage.writeBlob(codec.encode(facts.map((fact) => fact.toTransport())));
    this._rootsForFamily(pendingShard.family).set(chunkPath, oid);
    this._treeEntries.push(`100644 blob ${oid}\t${chunkPath}`);
    this.flushCount += 1;
    this.shardWriteCount += 1;
  }

  private _nextChunkIndex(pendingKey: string): number {
    const current = this._chunkIndexes.get(pendingKey) ?? 0;
    const next = current + 1;
    this._chunkIndexes.set(pendingKey, next);
    return next;
  }

  private _rootsForFamily(family: CheckpointBasisFactShardFamily): Map<string, string> {
    switch (family) {
      case 'node-liveness':
        return this._livenessRoots;
      case 'node-property':
        return this._propertyRoots;
      case 'outgoing-adjacency':
        return this._outgoingAdjacencyRoots;
      case 'incoming-adjacency':
        return this._incomingAdjacencyRoots;
      case 'edge-fact':
        return this._edgeFactRoots;
      case 'provenance':
        return this._provenanceRoots;
      case 'content-anchor':
        return this._contentAnchorRoots;
    }
  }
}

class CheckpointBasisPendingShard {
  readonly family: CheckpointBasisFactShardFamily;
  readonly basePath: string;
  readonly pendingKey: string;
  private readonly _facts: CheckpointBasisFact[];

  constructor(options: {
    readonly family: CheckpointBasisFactShardFamily;
    readonly basePath: string;
    readonly pendingKey: string;
  }) {
    this.family = options.family;
    this.basePath = options.basePath;
    this.pendingKey = options.pendingKey;
    this._facts = [];
  }

  get size(): number {
    return this._facts.length;
  }

  add(fact: CheckpointBasisFact): void {
    this._facts.push(fact);
  }

  takeSortedFacts(): readonly CheckpointBasisFact[] {
    const facts = [...this._facts].sort((left, right) => compareText(left.sortKey(), right.sortKey()));
    this._facts.length = 0;
    return Object.freeze(facts);
  }
}

function chunkedPath(
  family: CheckpointBasisFactShardFamily,
  basePath: string,
  chunkIndex: number,
): string {
  return `${family}/${basePath}.chunk-${String(chunkIndex).padStart(6, '0')}`;
}

function manifestRootFamily(family: CheckpointBasisFactShardFamily): 'node-liveness'
  | 'node-property'
  | 'outgoing-adjacency'
  | 'incoming-adjacency'
  | 'edge-fact' {
  if (
    family === 'node-liveness'
    || family === 'node-property'
    || family === 'outgoing-adjacency'
    || family === 'incoming-adjacency'
    || family === 'edge-fact'
  ) {
    return family;
  }
  throwBuilderError('family', 'not-a-manifest-root-family');
}

function appliedVersionVectorFromFrontier(frontier: Map<string, string>): Map<string, number> {
  const versionVector = new Map<string, number>();
  for (const writerId of [...frontier.keys()].sort()) {
    versionVector.set(writerId, 0);
  }
  return versionVector;
}

function copyFrontier(frontier: Map<string, string>): Map<string, string> {
  return new Map([...frontier.entries()].sort(([left], [right]) => compareText(left, right)));
}

function compareTreeEntries(left: string, right: string): number {
  const leftPath = left.slice(left.indexOf('\t') + 1);
  const rightPath = right.slice(right.indexOf('\t') + 1);
  return compareText(leftPath, rightPath);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateFactStream(facts: AsyncIterable<CheckpointBasisFact>): void {
  if (facts === null || facts === undefined || typeof facts[Symbol.asyncIterator] !== 'function') {
    throwBuilderError('facts', 'invalid-async-fact-stream');
  }
}

function validateFact(fact: CheckpointBasisFact): void {
  if (!(fact instanceof CheckpointBasisFact)) {
    throwBuilderError('fact', 'invalid-fact');
  }
}

function validateStorage(storage: CheckpointBasisPublicationStorage): void {
  if (
    storage === null
    || storage === undefined
    || typeof storage.writeBlob !== 'function'
    || typeof storage.writeTree !== 'function'
  ) {
    throwBuilderError('storage', 'invalid-storage');
  }
}

function validateFrontier(frontier: Map<string, string>): void {
  if (!(frontier instanceof Map) || frontier.size === 0) {
    throwBuilderError('frontier', 'invalid-frontier');
  }
  for (const [writerId, patchSha] of frontier) {
    validateText(writerId, 'frontier.writerId');
    validateText(patchSha, 'frontier.patchSha');
  }
}

function validateText(value: string, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throwBuilderError(field, 'empty-string');
  }
  return value;
}

function validatePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throwBuilderError(field, 'invalid-positive-integer');
  }
  return value;
}

function throwBuilderError(field: string, reason: string): never {
  throw new QueryError('Streaming checkpoint basis builder input is invalid.', {
    code: 'E_STREAMING_CHECKPOINT_BASIS_BUILDER',
    context: { field, reason },
  });
}
