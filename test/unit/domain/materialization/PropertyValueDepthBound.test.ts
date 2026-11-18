import { describe, expect, it } from 'vitest';
import { PropertyShard } from '../../../../src/domain/artifacts/PropertyShard.ts';
import {
  INDEX_SHARD_LIMITS,
  PROPERTY_SHARD_LEVELS_AROUND_VALUE,
  PROPERTY_SHARD_MAX_DEPTH,
} from '../../../../src/domain/materialization/IndexShardLimits.ts';
import { materializationPropertyShardKey } from '../../../../src/domain/materialization/MaterializationPropertyProfile.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import {
  PATCH_DECODE_MAX_DEPTH,
  PATCH_LEVELS_AROUND_PROPERTY_VALUE,
  PATCH_PROPERTY_VALUE_MAX_DEPTH,
} from '../../../../src/domain/types/PatchPropertyValueDepth.ts';
import type { PropValue } from '../../../../src/domain/types/PropValue.ts';
import EdgePropSet from '../../../../src/domain/types/ops/EdgePropSet.ts';
import NodePropSet from '../../../../src/domain/types/ops/NodePropSet.ts';
import computeShardKey from '../../../../src/domain/utils/shardKey.ts';
import { validateBoundedCbor } from '../../../../src/infrastructure/adapters/BoundedCborValidation.ts';
import CborIndexShardTree from '../../../../src/infrastructure/adapters/CborIndexShardTree.ts';
import { IndexShardEncodeTransform } from '../../../../src/infrastructure/adapters/IndexShardEncodeTransform.ts';
import { decodeIndexShard } from '../../../../src/infrastructure/adapters/IndexShardBound.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';

/**
 * #1159, decision on Safety Review F1 of PR #1214: the property-root depth
 * bound admits every value that the patch codec accepts, for its writer and
 * its readers alike, and derives from named constants.
 *
 * Oracle: the real encodings. The patch journal encodes a patch with
 * `defaultCodec.encode` and reads it with `defaultCodec.decode`; the
 * property root writes schema 2 shards through `IndexShardEncodeTransform`
 * and its readers decode them through `decodeIndexShard`, both at
 * `INDEX_SHARD_LIMITS`. Each level count is pinned at its exact edge.
 */
function nestedValue(depth: number): PropValue {
  let value: PropValue = 'leaf';
  for (let level = 0; level < depth; level += 1) {
    value = [value];
  }
  return value;
}

const PATCH_OPS = {
  node: (value: PropValue) => new NodePropSet('node:deep', 'k', value),
  edge: (value: PropValue) => new EdgePropSet({ from: 'node:a', to: 'node:b', label: 'l', key: 'k', value }),
} as const;

function patchBytes(op: keyof typeof PATCH_OPS, depth: number): Uint8Array {
  return defaultCodec.encode(new Patch({ writer: 'w', lamport: 1, context: {}, ops: [PATCH_OPS[op](nestedValue(depth))] }));
}

const DEEP_NODE = 'node:deep';
const VIEW_SHARD_KEY = computeShardKey(DEEP_NODE);

function propertyShard(depth: number, schemaVersion: 1 | 2): PropertyShard {
  const shardKey = schemaVersion === 1 ? VIEW_SHARD_KEY : materializationPropertyShardKey(DEEP_NODE);
  return new PropertyShard({ shardKey, schemaVersion, entries: [[DEEP_NODE, { k: nestedValue(depth) }]] });
}

describe('the property value depth that the patch codec reads back (#1159 F1)', () => {
  it('is the patch read depth minus the patch levels around a value', () => {
    expect(PATCH_PROPERTY_VALUE_MAX_DEPTH).toBe(PATCH_DECODE_MAX_DEPTH - PATCH_LEVELS_AROUND_PROPERTY_VALUE);
  });

  it.each(['node', 'edge'] as const)('reads a %s property value at that depth and refuses one level deeper', (op) => {
    expect(defaultCodec.decode(patchBytes(op, PATCH_PROPERTY_VALUE_MAX_DEPTH))).toMatchObject({ writer: 'w' });
    expect(() => defaultCodec.decode(patchBytes(op, PATCH_PROPERTY_VALUE_MAX_DEPTH + 1)))
      .toThrow(expect.objectContaining({ code: 'E_CBOR_DECODE_BOUNDS', message: expect.stringContaining('nesting depth') }));
  });
});

describe('the property shard depth (#1159 F1)', () => {
  it('is the patch property value depth plus the property root levels, and the shared bound admits it', () => {
    expect(PROPERTY_SHARD_MAX_DEPTH).toBe(PATCH_PROPERTY_VALUE_MAX_DEPTH + PROPERTY_SHARD_LEVELS_AROUND_VALUE);
    expect(INDEX_SHARD_LIMITS.structureLimits.maxDepth).toBeGreaterThanOrEqual(PROPERTY_SHARD_MAX_DEPTH);
  });

  it('writes and reads back a property root shard that holds the deepest value the patch codec reads', () => {
    const [path, bytes] = new IndexShardEncodeTransform(defaultCodec, INDEX_SHARD_LIMITS)
      .encodeShard(propertyShard(PATCH_PROPERTY_VALUE_MAX_DEPTH, 2));

    expect(decodeIndexShard(defaultCodec, { path, bytes }, INDEX_SHARD_LIMITS)).toMatchObject({ schemaVersion: 2 });
  });

  it('counts the property root levels exactly: one level deeper exceeds the property shard depth', () => {
    const limits = { ...INDEX_SHARD_LIMITS.structureLimits, maxDepth: PROPERTY_SHARD_MAX_DEPTH };
    const encode = (depth: number) => new IndexShardEncodeTransform(defaultCodec).encodeShard(propertyShard(depth, 2))[1];

    expect(() => validateBoundedCbor(encode(PATCH_PROPERTY_VALUE_MAX_DEPTH), limits)).not.toThrow();
    expect(() => validateBoundedCbor(encode(PATCH_PROPERTY_VALUE_MAX_DEPTH + 1), limits))
      .toThrow(expect.objectContaining({ code: 'E_INDEX_SHARD_MALFORMED', context: { reason: 'nesting depth exceeds the configured maximum' } }));
  });

  it('builds and reads back an in-memory view tree (schema 1) that holds the deepest value', () => {
    const tree = new CborIndexShardTree({ codec: defaultCodec, tree: {} }).withShards([propertyShard(PATCH_PROPERTY_VALUE_MAX_DEPTH, 1)]);

    expect(new CborIndexShardTree({ codec: defaultCodec, tree }).readProperties(VIEW_SHARD_KEY))
      .toEqual(new Map([[DEEP_NODE, { k: nestedValue(PATCH_PROPERTY_VALUE_MAX_DEPTH) }]]));
  });
});
