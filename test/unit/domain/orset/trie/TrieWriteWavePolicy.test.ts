import { describe, expect, it } from 'vitest';

import {
  shouldFlushBranchWriteWave,
  shouldFlushLeafWriteWave,
  TRIE_BRANCH_WRITE_WAVE_MAX_ITEMS,
  TRIE_LEAF_WRITE_WAVE_MAX_ITEMS,
} from '../../../../../src/domain/orset/trie/TrieWriteWavePolicy.ts';

describe('TrieWriteWavePolicy', () => {
  it('flushes item waves that have already crossed their ceilings', () => {
    expect(shouldFlushLeafWriteWave({
      byteLength: 1,
      itemCount: TRIE_LEAF_WRITE_WAVE_MAX_ITEMS + 1,
      nextByteLength: 1,
    })).toBe(true);
    expect(shouldFlushBranchWriteWave({
      depth: 1,
      itemCount: TRIE_BRANCH_WRITE_WAVE_MAX_ITEMS + 1,
      nextDepth: 1,
    })).toBe(true);
  });
});
