import { LWWRegister } from '../../crdt/LWW.ts';
import QueryError from '../../errors/QueryError.ts';
import NodeAdd from '../../types/ops/NodeAdd.ts';
import NodePropSet from '../../types/ops/NodePropSet.ts';
import NodeRemove from '../../types/ops/NodeRemove.ts';
import type { PropValue } from '../../types/PropValue.ts';
import computeShardKey from '../../utils/shardKey.ts';
import { EventId, compareEventIds } from '../../utils/EventId.ts';
import { buildCheckpointRef } from '../../utils/RefLayout.ts';
import { deserializeFrontier } from '../Frontier.ts';
import { partitionShardOids } from '../MaterializedViewHelpers.ts';
import { normalizeRawOp } from '../OpNormalizer.ts';
import LogicalIndexReader from '../index/LogicalIndexReader.ts';
import PropertyIndexReader from '../index/PropertyIndexReader.ts';
import {
  CHECKPOINT_SCHEMA_INDEX_TREE,
  partitionTreeOids,
} from '../state/checkpointHelpers.ts';
import NodeOpticReadResult from './NodeOpticReadResult.ts';
import NodePropertyOpticReadResult from './NodePropertyOpticReadResult.ts';
import ReadIdentity, {
  type ReadIdentityIndexShard,
  type ReadIdentityTailWitness,
} from './ReadIdentity.ts';
import type CheckpointTailOpticSource from './CheckpointTailOpticSource.ts';
import type { CheckpointTailPatchEntry } from './CheckpointTailOpticSource.ts';
import CheckpointTailWitnessScan, { type TailWitnessScan } from './CheckpointTailWitnessScan.ts';
import { textDecode, textEncode } from '../../utils/bytes.ts';

const REDUCER_VERSION = 'checkpoint-tail-locator-v1';
const PROJECTION_VERSION = 'optic-read-v17-foundation-v1';
const DEFAULT_MAX_TAIL_PATCHES = 10_000;
const CAS_POINTER_PREFIX = 'git-warp:cas-pointer:v1:';
const CAS_POINTER_PREFIX_BYTES = textEncode(CAS_POINTER_PREFIX);

type CheckpointIndexBasis = {
  readonly checkpointSha: string;
  readonly schema: number;
  readonly frontier: Map<string, string>;
  readonly indexOids: { readonly [path: string]: string };
  readonly propOids: { readonly [path: string]: string };
};

export default class CheckpointTailWitnessLocator {
  private readonly _source: CheckpointTailOpticSource;
  private readonly _maxTailPatches: number;
  private readonly _tailScan: CheckpointTailWitnessScan;

  constructor(options: {
    readonly source: CheckpointTailOpticSource;
    readonly maxTailPatches?: number;
  }) {
    this._source = options.source;
    this._maxTailPatches = options.maxTailPatches ?? DEFAULT_MAX_TAIL_PATCHES;
    this._tailScan = new CheckpointTailWitnessScan({
      source: this._source,
      maxTailPatches: this._maxTailPatches,
    });
    Object.freeze(this);
  }

  async readNode(nodeId: string): Promise<NodeOpticReadResult> {
    const basis = await this._loadCheckpointIndexBasis();
    const baseAlive = await this._readCheckpointNodeAlive(basis, nodeId);
    const tail = await this._scanTailForNode(basis, nodeId);
    const alive = this._reduceNodeLiveness(baseAlive, tail.entries, nodeId);
    return new NodeOpticReadResult({
      nodeId,
      alive,
      readIdentity: this._readIdentity({
        basis,
        entityAspect: `node:${nodeId}:liveness`,
        checkpointIndexShards: this._nodeShardIdentities(basis, nodeId),
        tailWitnesses: tail.witnesses,
      }),
    });
  }

  async readNodeProperty(
    nodeId: string,
    propertyKey: string,
  ): Promise<NodePropertyOpticReadResult> {
    const basis = await this._loadCheckpointIndexBasis();
    const baseValue = await this._readCheckpointProperty(basis, nodeId, propertyKey);
    const tail = await this._scanTailForProperty(basis, nodeId, propertyKey);
    const value = this._reduceProperty({
      baseValue,
      tailEntries: tail.entries,
      nodeId,
      propertyKey,
    });
    return new NodePropertyOpticReadResult({
      nodeId,
      key: propertyKey,
      value,
      readIdentity: this._readIdentity({
        basis,
        entityAspect: `node:${nodeId}:prop:${propertyKey}`,
        checkpointIndexShards: this._propertyShardIdentities(basis, nodeId),
        tailWitnesses: tail.witnesses,
      }),
    });
  }

  private async _loadCheckpointIndexBasis(): Promise<CheckpointIndexBasis> {
    const checkpointRef = buildCheckpointRef(this._source.graphName);
    const checkpointSha = await this._source._persistence.readRef(checkpointRef);
    if (checkpointSha === null) {
      throwNoBoundedBasis(this._source.graphName, 'missing-checkpoint');
    }

    const commitMessage = await this._source._persistence.showNode(checkpointSha);
    const checkpointMessage = this._source._commitMessageCodec.decodeCheckpoint(commitMessage);
    if (checkpointMessage.schema !== CHECKPOINT_SCHEMA_INDEX_TREE) {
      throwNoBoundedBasis(this._source.graphName, 'checkpoint-without-index-tree');
    }

    const indexShardOids = await this._loadCheckpointIndexShardOids(checkpointMessage.indexOid);
    const frontierBytes = await this._readCheckpointPayloadBlob(checkpointMessage.frontierOid);
    const frontier = deserializeFrontier(frontierBytes, { codec: this._source._codec });
    const { indexOids, propOids } = partitionShardOids(indexShardOids);
    if (Object.keys(indexOids).length === 0 && Object.keys(propOids).length === 0) {
      throwNoBoundedBasis(this._source.graphName, 'checkpoint-missing-index-shards');
    }

    return {
      checkpointSha,
      schema: checkpointMessage.schema,
      frontier,
      indexOids,
      propOids,
    };
  }

  private async _readCheckpointPayloadBlob(oid: string): Promise<Uint8Array> {
    const bytes = await this._source._persistence.readBlob(oid);
    const storageOid = decodeCasPayloadPointer(bytes);
    if (storageOid === null) {
      return bytes;
    }
    if (this._source._blobStorage === null) {
      throwNoBoundedBasis(this._source.graphName, 'checkpoint-payload-pointer-without-storage');
    }
    return await this._source._blobStorage.retrieve(storageOid);
  }

  private async _loadCheckpointIndexShardOids(
    checkpointTreeOid: string,
  ): Promise<{ readonly [path: string]: string }> {
    const rawTreeOids = await this._source._persistence.readTreeOids(checkpointTreeOid);
    const { treeOids, indexShardOids } = partitionTreeOids(rawTreeOids);
    if (Object.keys(indexShardOids).length > 0) {
      return indexShardOids;
    }

    const indexTreeOid = treeOids['index'];
    if (indexTreeOid === undefined) {
      return indexShardOids;
    }
    return await this._source._persistence.readTreeOids(indexTreeOid);
  }

  private async _readCheckpointNodeAlive(
    basis: CheckpointIndexBasis,
    nodeId: string,
  ): Promise<boolean> {
    const path = metaPath(nodeId);
    const oid = basis.indexOids[path];
    if (oid === undefined) {
      return false;
    }
    const reader = await new LogicalIndexReader({ codec: this._source._codec })
      .loadFromOids({ [path]: oid }, this._source._persistence);
    return reader.toLogicalIndex().isAlive(nodeId);
  }

  private async _readCheckpointProperty(
    basis: CheckpointIndexBasis,
    nodeId: string,
    propertyKey: string,
  ): Promise<PropValue | undefined> {
    const path = propertyPath(nodeId);
    const oid = basis.propOids[path];
    if (oid === undefined) {
      return undefined;
    }
    const reader = new PropertyIndexReader({
      storage: this._source._persistence,
      codec: this._source._codec,
      maxCachedShards: 1,
    });
    reader.setup({ [path]: oid });
    return await reader.getProperty(nodeId, propertyKey);
  }

  private async _scanTailForNode(
    basis: CheckpointIndexBasis,
    nodeId: string,
  ): Promise<TailWitnessScan> {
    return await this._tailScan.collect({
      basis,
      includeEntry: (entry) => patchTouchesNode(entry, nodeId),
    });
  }

  private async _scanTailForProperty(
    basis: CheckpointIndexBasis,
    nodeId: string,
    propertyKey: string,
  ): Promise<TailWitnessScan> {
    return await this._tailScan.collect({
      basis,
      includeEntry: (entry) => patchTouchesProperty(entry, nodeId, propertyKey),
    });
  }

  private _reduceNodeLiveness(
    baseAlive: boolean,
    tailEntries: readonly CheckpointTailPatchEntry[],
    nodeId: string,
  ): boolean {
    let alive = baseAlive;
    for (const entry of tailEntries) {
      alive = this._reduceNodeLivenessEntry(alive, entry, nodeId);
    }
    return alive;
  }

  private _reduceNodeLivenessEntry(
    currentAlive: boolean,
    entry: CheckpointTailPatchEntry,
    nodeId: string,
  ): boolean {
    let alive = currentAlive;
    for (const rawOp of entry.patch.ops) {
      alive = this._reduceNodeLivenessOp(alive, normalizeRawOp(rawOp), nodeId);
    }
    return alive;
  }

  private _reduceNodeLivenessOp(
    currentAlive: boolean,
    op: ReturnType<typeof normalizeRawOp>,
    nodeId: string,
  ): boolean {
    if (isTargetNodeAdd(op, nodeId)) {
      return true;
    }
    if (isTargetNodeRemove(op, nodeId)) {
      throwNoBoundedBasis(this._source.graphName, 'tail-node-remove-needs-raw-liveness-witnesses');
    }
    return currentAlive;
  }

  private _reduceProperty(options: {
    readonly baseValue: PropValue | undefined;
    readonly tailEntries: readonly CheckpointTailPatchEntry[];
    readonly nodeId: string;
    readonly propertyKey: string;
  }): PropValue | undefined {
    const tailRegister = this._tailPropertyRegister(options);
    return tailRegister !== null ? tailRegister.value : options.baseValue;
  }

  private _tailPropertyRegister(options: {
    readonly tailEntries: readonly CheckpointTailPatchEntry[];
    readonly nodeId: string;
    readonly propertyKey: string;
  }): LWWRegister<PropValue> | null {
    let tailRegister: LWWRegister<PropValue> | null = null;
    for (const entry of options.tailEntries) {
      for (let opIndex = 0; opIndex < entry.patch.ops.length; opIndex += 1) {
        const rawOp = entry.patch.ops[opIndex];
        if (rawOp === undefined) {
          continue;
        }
        const op = normalizeRawOp(rawOp);
        tailRegister = this._addTailPropertyRegister({
          current: tailRegister,
          entry,
          nodeId: options.nodeId,
          op,
          opIndex,
          propertyKey: options.propertyKey,
        });
      }
    }
    return tailRegister;
  }

  private _addTailPropertyRegister(options: {
    readonly current: LWWRegister<PropValue> | null;
    readonly entry: CheckpointTailPatchEntry;
    readonly nodeId: string;
    readonly op: ReturnType<typeof normalizeRawOp>;
    readonly opIndex: number;
    readonly propertyKey: string;
  }): LWWRegister<PropValue> | null {
    if (!isTargetPropertyOp(options.op, options.nodeId, options.propertyKey)) {
      return options.current;
    }
    return LWWRegister.max(
      options.current,
      new LWWRegister(
        new EventId(options.entry.patch.lamport, options.entry.patch.writer, options.entry.sha, options.opIndex),
        readScalarTailPropertyValue(options.op, this._source.graphName),
      ),
    );
  }

  private _readIdentity(options: {
    readonly basis: CheckpointIndexBasis;
    readonly entityAspect: string;
    readonly checkpointIndexShards: readonly ReadIdentityIndexShard[];
    readonly tailWitnesses: readonly ReadIdentityTailWitness[];
  }): ReadIdentity {
    return new ReadIdentity({
      worldline: this._source.graphName,
      entityAspect: options.entityAspect,
      checkpointSha: options.basis.checkpointSha,
      checkpointFrontier: frontierIdentity(options.basis.frontier),
      checkpointIndexShards: options.checkpointIndexShards,
      tailWitnesses: sortTailWitnesses(options.tailWitnesses),
      reducerVersion: REDUCER_VERSION,
      projectionVersion: PROJECTION_VERSION,
    });
  }

  private _nodeShardIdentities(
    basis: CheckpointIndexBasis,
    nodeId: string,
  ): readonly ReadIdentityIndexShard[] {
    return shardIdentities([{ path: metaPath(nodeId), oid: basis.indexOids[metaPath(nodeId)] }]);
  }

  private _propertyShardIdentities(
    basis: CheckpointIndexBasis,
    nodeId: string,
  ): readonly ReadIdentityIndexShard[] {
    return shardIdentities([{ path: propertyPath(nodeId), oid: basis.propOids[propertyPath(nodeId)] }]);
  }
}

function patchTouchesNode(entry: CheckpointTailPatchEntry, nodeId: string): boolean {
  return entry.patch.ops.some((rawOp) => {
    const op = normalizeRawOp(rawOp);
    return (op instanceof NodeAdd || op instanceof NodeRemove)
      && op.node === nodeId;
  });
}

function patchTouchesProperty(
  entry: CheckpointTailPatchEntry,
  nodeId: string,
  propertyKey: string,
): boolean {
  return entry.patch.ops.some((rawOp) => {
    const op = normalizeRawOp(rawOp);
    return op instanceof NodePropSet && op.node === nodeId && op.key === propertyKey;
  });
}

function isTargetPropertyOp(
  op: ReturnType<typeof normalizeRawOp>,
  nodeId: string,
  propertyKey: string,
): op is NodePropSet {
  return op instanceof NodePropSet && op.node === nodeId && op.key === propertyKey;
}

function isTargetNodeAdd(
  op: ReturnType<typeof normalizeRawOp>,
  nodeId: string,
): op is NodeAdd {
  return op instanceof NodeAdd && op.node === nodeId;
}

function isTargetNodeRemove(
  op: ReturnType<typeof normalizeRawOp>,
  nodeId: string,
): op is NodeRemove {
  return op instanceof NodeRemove && op.node === nodeId;
}

function readScalarTailPropertyValue(
  op: NodePropSet,
  graphName: string,
): PropValue {
  const { value } = op;
  if (isPrimitiveTailPropertyValue(value) || value instanceof Uint8Array) {
    return value;
  }
  return throwNoBoundedBasis(graphName, 'tail-property-value-needs-parser');
}

function isPrimitiveTailPropertyValue(
  value: NodePropSet['value'],
): value is string | number | boolean | null {
  return value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean';
}

function frontierIdentity(frontier: Map<string, string>) {
  return Object.freeze(
    [...frontier.entries()]
      .sort(([leftWriter], [rightWriter]) => leftWriter.localeCompare(rightWriter))
      .map(([writerId, patchSha]) => Object.freeze({ writerId, patchSha })),
  );
}

function sortTailWitnesses(
  witnesses: readonly ReadIdentityTailWitness[],
): readonly ReadIdentityTailWitness[] {
  return Object.freeze(
    [...witnesses].sort((left, right) => compareTailWitnesses(left, right)),
  );
}

function compareTailWitnesses(
  left: ReadIdentityTailWitness,
  right: ReadIdentityTailWitness,
): number {
  return compareEventIds(
    new EventId(left.lamport, left.writerId, left.sha, 0),
    new EventId(right.lamport, right.writerId, right.sha, 0),
  );
}

function shardIdentities(
  shards: readonly { readonly path: string; readonly oid: string | undefined }[],
): readonly ReadIdentityIndexShard[] {
  return Object.freeze(
    shards
      .filter((shard): shard is { readonly path: string; readonly oid: string } => shard.oid !== undefined)
      .map((shard) => Object.freeze({ path: shard.path, oid: shard.oid })),
  );
}

function metaPath(nodeId: string): string {
  return `meta_${computeShardKey(nodeId)}.cbor`;
}

function propertyPath(nodeId: string): string {
  return `props_${computeShardKey(nodeId)}.cbor`;
}

function decodeCasPayloadPointer(bytes: Uint8Array): string | null {
  if (!hasCasPointerPrefix(bytes)) {
    return null;
  }
  const decoded = textDecode(bytes);
  if (!decoded.startsWith(CAS_POINTER_PREFIX)) {
    return null;
  }
  const storageOid = decoded.slice(CAS_POINTER_PREFIX.length);
  if (storageOid.length === 0) {
    throwNoBoundedBasis('unknown', 'empty-checkpoint-payload-pointer');
  }
  return storageOid;
}

function hasCasPointerPrefix(bytes: Uint8Array): boolean {
  if (bytes.length < CAS_POINTER_PREFIX_BYTES.length) {
    return false;
  }
  for (let index = 0; index < CAS_POINTER_PREFIX_BYTES.length; index += 1) {
    if (bytes[index] !== CAS_POINTER_PREFIX_BYTES[index]) {
      return false;
    }
  }
  return true;
}

function throwNoBoundedBasis(graphName: string, reason: string): never {
  throw new QueryError('No bounded checkpoint-tail optic basis is available.', {
    code: 'E_OPTIC_NO_BOUNDED_BASIS',
    context: { graphName, reason },
  });
}
