import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import ORSet from '../../../../../src/domain/crdt/ORSet.ts';
import QueryNodePatternIndex from '../../../../../src/domain/services/query/QueryNodePatternIndex.ts';

describe('QueryNodePatternIndex', () => {
  it('answers exact node ids without enumerating OR-Set entry keys', () => {
    const alive = aliveSet(['user:alice', 'user:bob', 'task:ready']);
    alive.entries = new ThrowingKeysMap(alive.entries);
    const index = new QueryNodePatternIndex(alive);

    expect([...index.liveCandidates('user:alice')]).toEqual(['user:alice']);
    expect([...index.liveCandidates('user:missing')]).toEqual([]);
  });

  it('answers prefix patterns from a reusable sorted key index', () => {
    const alive = aliveSet(['task:ready', 'user:bob', 'user:alice', 'user:carol']);
    const index = new QueryNodePatternIndex(alive);

    expect([...index.liveCandidates('user:*')]).toEqual(['user:alice', 'user:bob', 'user:carol']);

    alive.entries = new ThrowingKeysMap(alive.entries);
    expect([...index.liveCandidates('user:*')]).toEqual(['user:alice', 'user:bob', 'user:carol']);
  });

  it('deduplicates overlapping exact and prefix pattern arrays deterministically', () => {
    const alive = aliveSet(['user:alice', 'user:bob', 'admin:root']);
    const index = new QueryNodePatternIndex(alive);

    expect([...index.liveCandidates(['user:alice', 'user:*'])]).toEqual(['user:alice', 'user:bob']);
  });
});

class ThrowingKeysMap extends Map<string, Set<string>> {
  override keys(): MapIterator<string> {
    throw new Error('entry key enumeration trap');
  }
}

function aliveSet(nodeIds: readonly string[]): ORSet {
  const alive = ORSet.empty();
  nodeIds.forEach((nodeId, index) => {
    alive.add(nodeId, Dot.create('writer', index + 1));
  });
  return alive;
}
