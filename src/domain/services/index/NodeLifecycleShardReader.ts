/**
 * Boundary reader for node lifecycle shards.
 *
 * Validates one decoded `life_XX.cbor` payload into NodeLifecycleRecords.
 * Only the canonical form the encoder writes is accepted: records in
 * ascending node id order, pending removes ascending above the birth, and
 * registers in ascending key order. Anything else is a malformed shard.
 *
 * Payload, schema 1:
 *   { schemaVersion: 1, entries: [[nodeId, [birth, clear, [pending...], [[key, event]...]]]...] }
 * where each event is [lamport, writerId, patchSha, opIndex], and birth and
 * clear are null when absent.
 *
 * @module domain/services/index/NodeLifecycleShardReader
 */

import { NodeLifecycleRecord } from '../../artifacts/NodeLifecycleRecord.ts';
import { NODE_LIFECYCLE_SHARD_SCHEMA_VERSION } from '../../artifacts/NodeLifecycleShard.ts';
import IndexError from '../../errors/IndexError.ts';
import WarpError from '../../errors/WarpError.ts';
import type CodecValue from '../../types/codec/CodecValue.ts';
import { EventId } from '../../utils/EventId.ts';
import computeShardKey from '../../utils/shardKey.ts';

/** Bundle member that marks an index root as carrying node lifecycle records. */
export const NODE_LIFECYCLE_RECEIPT_PATH = 'life_receipt.cbor';

const NODE_LIFECYCLE_PATH_PREFIX = 'life_';
const ENVELOPE_KEYS = 'entries,schemaVersion';
const PAIR_FIELDS = 2;
const RECORD_FIELDS = 4;
const EVENT_FIELDS = 4;

type CodecRecord = { readonly [key: string]: CodecValue };

/** Bundle member path of the lifecycle shard for one shard key. */
export function nodeLifecycleShardPathForKey(shardKey: string): string {
  return `${NODE_LIFECYCLE_PATH_PREFIX}${shardKey}.cbor`;
}

/** Bundle member path of the lifecycle shard that holds `nodeId`'s record. */
export function nodeLifecycleShardPath(nodeId: string): string {
  return nodeLifecycleShardPathForKey(computeShardKey(nodeId));
}

/** Decodes one lifecycle shard into its records, keyed by node id. */
export function decodeNodeLifecycleShard(
  decoded: CodecValue,
  path: string,
): ReadonlyMap<string, NodeLifecycleRecord> {
  const records = new Map<string, NodeLifecycleRecord>();
  let previous = '';
  for (const entry of requireEnvelope(decoded, path)) {
    const record = decodeRecord(entry, path);
    if (previous >= record.nodeId || nodeLifecycleShardPath(record.nodeId) !== path) {
      throw malformed(path, 'records must be ascending by node id and routed to this shard');
    }
    records.set(record.nodeId, record);
    previous = record.nodeId;
  }
  return records;
}

function requireEnvelope(decoded: CodecValue, path: string): readonly CodecValue[] {
  if (!isCodecRecord(decoded) || Object.keys(decoded).sort().join(',') !== ENVELOPE_KEYS) {
    throw malformed(path, 'invalid schema envelope');
  }
  if (decoded['schemaVersion'] !== NODE_LIFECYCLE_SHARD_SCHEMA_VERSION) {
    throw malformed(path, 'unsupported node lifecycle shard schema version');
  }
  return requireArray(decoded['entries'], path);
}

function decodeRecord(entry: CodecValue, path: string): NodeLifecycleRecord {
  const [nodeId, fields] = requireTuple(entry, PAIR_FIELDS, path);
  const [birth, clear, pending, registers] = requireTuple(fields, RECORD_FIELDS, path);
  return validated(path, () => new NodeLifecycleRecord({
    nodeId: requireString(nodeId, path),
    birth: birth === null ? null : decodeEvent(birth, path),
    clear: clear === null ? null : decodeEvent(clear, path),
    pendingRemoves: requireArray(pending, path).map((removal) => decodeEvent(removal, path)),
    registers: requireArray(registers, path).map((register) => decodeRegister(register, path)),
  }));
}

function decodeRegister(value: CodecValue, path: string): readonly [string, EventId] {
  const [key, event] = requireTuple(value, PAIR_FIELDS, path);
  return [requireString(key, path), decodeEvent(event, path)];
}

function decodeEvent(value: CodecValue | undefined, path: string): EventId {
  const [lamport, writerId, patchSha, opIndex] = requireTuple(value, EVENT_FIELDS, path);
  return validated(path, () => new EventId(
    requireNumber(lamport, path),
    requireString(writerId, path),
    requireString(patchSha, path),
    requireNumber(opIndex, path),
  ));
}

function requireTuple(value: CodecValue | undefined, length: number, path: string): readonly CodecValue[] {
  const tuple = requireArray(value, path);
  if (tuple.length !== length) {
    throw malformed(path, `expected ${String(length)} fields`);
  }
  return tuple;
}

function requireArray(value: CodecValue | undefined, path: string): readonly CodecValue[] {
  if (!isCodecArray(value)) {
    throw malformed(path, 'expected an array');
  }
  return value;
}

function requireString(value: CodecValue | undefined, path: string): string {
  if (typeof value !== 'string') {
    throw malformed(path, 'expected a string');
  }
  return value;
}

function requireNumber(value: CodecValue | undefined, path: string): number {
  if (typeof value !== 'number') {
    throw malformed(path, 'expected a number');
  }
  return value;
}

/** Runs a validating constructor and reports its refusal as a malformed shard. */
function validated<T>(path: string, construct: () => T): T {
  try {
    return construct();
  } catch (error) {
    if (error instanceof WarpError && !(error instanceof IndexError)) {
      throw malformed(path, error.message);
    }
    throw error;
  }
}

function isCodecArray(value: CodecValue | undefined): value is readonly CodecValue[] {
  return Array.isArray(value);
}

function isCodecRecord(value: CodecValue): value is CodecRecord {
  if (value === null || typeof value !== 'object' || isCodecArray(value)) {
    return false;
  }
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function malformed(path: string, reason: string): IndexError {
  return new IndexError(`NodeLifecycleShardReader: invalid shard '${path}' (${reason})`, {
    code: 'E_INDEX_SHARD_MALFORMED',
    context: { path, reason },
  });
}
