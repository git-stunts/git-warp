import { describe, expect, it } from 'vitest';

import {
  MAX_MATERIALIZATION_INDEX_SHARDS,
  requireMaterializationIndexShardCount,
} from '../../../../src/domain/materialization/MaterializationIndexProfile.ts';

describe('MaterializationIndexProfile', () => {
  it('accepts positive shard counts through the retained index ceiling', () => {
    expect(requireMaterializationIndexShardCount(1)).toBe(1);
    expect(requireMaterializationIndexShardCount(MAX_MATERIALIZATION_INDEX_SHARDS))
      .toBe(MAX_MATERIALIZATION_INDEX_SHARDS);
  });

  it.each([0, -1, 1.5, Number.NaN, MAX_MATERIALIZATION_INDEX_SHARDS + 1])(
    'rejects invalid or unbounded shard count %s',
    (count) => {
      expect(() => requireMaterializationIndexShardCount(count))
        .toThrowError(expect.objectContaining({ code: 'E_MATERIALIZATION_INDEX_LIMIT' }));
    },
  );
});
