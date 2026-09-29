import { expect, it } from 'vitest';
import IndexPropertyUpdater from '../../../../src/domain/services/index/IndexPropertyUpdater.ts';
import { createEmptyState } from '../../../../src/domain/services/JoinReducer.ts';
import { PropDiffEntry } from '../../../../src/domain/types/PatchDiff.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import IndexError from '../../../../src/domain/errors/IndexError.ts';

it('rejects a malformed persisted property bag instead of replacing it with an empty bag', () => {
  const updater = new IndexPropertyUpdater(defaultCodec);
  const propsChanged = [new PropDiffEntry({ nodeId: 'n', key: 'k', value: 1, prevValue: undefined })];
  const bytes = defaultCodec.encode([['n', null]]);
  expect(() => updater.computeDirtyPropertyShards({
    propsChanged, nodesCleared: [], state: createEmptyState(),
  }, () => bytes)).toThrow(IndexError);
});

it('treats deletion of an absent property bag as an empty shard', () => {
  const updater = new IndexPropertyUpdater(defaultCodec);
  const result = updater.computeDirtyPropertyShards({
    propsChanged: [new PropDiffEntry({ nodeId: 'n', key: 'k', value: undefined, prevValue: 1 })],
    nodesCleared: ['n'], state: createEmptyState(),
  }, () => undefined);
  expect(Object.values(result).map((bytes) => defaultCodec.decode(bytes))).toEqual([[]]);
});
