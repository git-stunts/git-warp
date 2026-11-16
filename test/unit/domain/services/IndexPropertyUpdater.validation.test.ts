import { expect, it } from 'vitest';
import IndexPropertyUpdater from '../../../../src/domain/services/index/IndexPropertyUpdater.ts';
import { createEmptyState } from '../../../../src/domain/services/JoinReducer.ts';
import { PropDiffEntry } from '../../../../src/domain/types/PatchDiff.ts';
import computeShardKey from '../../../../src/domain/utils/shardKey.ts';
import CborIndexShardTree from '../../../../src/infrastructure/adapters/CborIndexShardTree.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import IndexError from '../../../../src/domain/errors/IndexError.ts';

it('rejects a malformed persisted property bag instead of replacing it with an empty bag', () => {
  const updater = new IndexPropertyUpdater();
  const propsChanged = [new PropDiffEntry({ nodeId: 'n', key: 'k', value: 1, prevValue: undefined })];
  const tree = { [`props_${computeShardKey('n')}.cbor`]: defaultCodec.encode([['n', null]]) };
  expect(() => updater.computeDirtyPropertyShards({
    propsChanged, nodesCleared: [], state: createEmptyState(),
  }, new CborIndexShardTree({ codec: defaultCodec, tree }))).toThrow(IndexError);
});

it('treats deletion of an absent property bag as an empty shard', () => {
  const updater = new IndexPropertyUpdater();
  const result = updater.computeDirtyPropertyShards({
    propsChanged: [new PropDiffEntry({ nodeId: 'n', key: 'k', value: undefined, prevValue: 1 })],
    nodesCleared: ['n'], state: createEmptyState(),
  }, new CborIndexShardTree({ codec: defaultCodec, tree: {} }));
  expect(result.map((shard) => [shard.shardKey, shard.entries])).toEqual([[computeShardKey('n'), []]]);
});
