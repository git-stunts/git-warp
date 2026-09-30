import QueryError from '../../errors/QueryError.ts';
import type { NodeLifecycleRecord } from '../../artifacts/NodeLifecycleRecord.ts';
import type { PropValue } from '../../types/PropValue.ts';
import type { EventId } from '../../utils/EventId.ts';
import type { NodeLifecycleSource } from '../state/NodeLifecycle.ts';
import type CheckpointShardFactReader from './CheckpointShardFactReader.ts';
import type { CheckpointTailIndexBasis } from './CheckpointTailBasisLoader.ts';
import type { CheckpointNodeLifecycle } from './CheckpointTailFactReducer.ts';
import type { ReadIdentityIndexShard } from './ReadIdentity.ts';

/** What the checkpoint basis says about one node property, and the shards that said it. */
export type CheckpointNodePropertyWitness = Readonly<{
  baseValue: PropValue | undefined;
  checkpointLifecycle: CheckpointNodeLifecycle;
  checkpointIndexShards: readonly ReadIdentityIndexShard[];
}>;

type CheckpointNodePropertyReadOptions = Readonly<{
  basis: CheckpointTailIndexBasis;
  graphName: string;
  nodeId: string;
  propertyKey: string;
  shardReader: CheckpointShardFactReader;
}>;

/**
 * Reads the checkpoint side of a bounded node-property read: the visible
 * value from the property shard and, when the index root carries node
 * lifecycle records, the node's record and liveness.
 */
export async function readCheckpointNodeProperty(
  options: CheckpointNodePropertyReadOptions,
): Promise<CheckpointNodePropertyWitness> {
  const { basis, nodeId, propertyKey, shardReader } = options;
  const baseValue = await shardReader.readProperty(basis, nodeId, propertyKey);
  const propertyShards = shardReader.propertyShardIdentities(basis, nodeId);
  const lifecycle = await shardReader.readNodeLifecycle(basis, nodeId);
  if (lifecycle.kind === 'unwitnessed') {
    return Object.freeze({
      baseValue,
      checkpointLifecycle: Object.freeze({ kind: 'unwitnessed' }),
      checkpointIndexShards: propertyShards,
    });
  }
  return await witnessedProperty(options, {
    baseValue,
    propertyShards,
    record: lifecycle.record,
    floatingTombstones: lifecycle.floatingTombstones,
  });
}

async function witnessedProperty(
  options: CheckpointNodePropertyReadOptions,
  read: Readonly<{
    baseValue: PropValue | undefined;
    propertyShards: readonly ReadIdentityIndexShard[];
    record: NodeLifecycleRecord | null;
    floatingTombstones: ReadonlySet<string>;
  }>,
): Promise<CheckpointNodePropertyWitness> {
  const { basis, nodeId, shardReader } = options;
  const baseRegisterEvent = read.record?.registerEvent(options.propertyKey) ?? null;
  if (read.baseValue !== undefined && baseRegisterEvent === null) {
    throwInconsistentBasis(options.graphName, nodeId);
  }
  return Object.freeze({
    baseValue: read.baseValue,
    checkpointLifecycle: Object.freeze({
      kind: 'witnessed',
      lifecycle: lifecycleSource(nodeId, read.record),
      baseRegisterEvent,
      baseAlive: await shardReader.readNodeAlive(basis, nodeId),
      floatingTombstones: read.floatingTombstones,
    }),
    checkpointIndexShards: Object.freeze([
      ...read.propertyShards,
      ...shardReader.nodeLivenessShardIdentities(basis, nodeId),
      ...shardReader.nodeLifecycleShardIdentities(basis, nodeId),
    ]),
  });
}

function lifecycleSource(nodeId: string, record: NodeLifecycleRecord | null): NodeLifecycleSource {
  if (record === null) {
    return {};
  }
  return {
    nodeBirthEvent: singleEntry(nodeId, record.birth),
    nodeClearEvent: singleEntry(nodeId, record.clear),
    nodePendingRemoveEvents: new Map(record.pendingRemoves.length === 0 ? [] : [[nodeId, record.pendingRemoves]]),
  };
}

function singleEntry(nodeId: string, event: EventId | null): ReadonlyMap<string, EventId> {
  return new Map(event === null ? [] : [[nodeId, event]]);
}

/** A visible checkpoint value must have a register EventId beside it. */
function throwInconsistentBasis(graphName: string, nodeId: string): never {
  throw new QueryError('Checkpoint node lifecycle records do not match the property shard.', {
    code: 'E_OPTIC_NO_BOUNDED_BASIS',
    context: { graphName, reason: 'checkpoint-shard-invalid', nodeId },
  });
}
