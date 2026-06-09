import { describe, expect, it } from 'vitest';
import { partitionShardOids } from '../../../../src/domain/services/MaterializedViewHelpers.ts';
import { partitionTreeOids } from '../../../../src/domain/services/state/checkpointHelpers.ts';

describe('path-keyed tree map helpers', () => {
  it('partitions checkpoint tree paths without trusting object-member names', () => {
    const result = partitionTreeOids(Object.fromEntries([
      ['__proto__', 'oid-root'],
      ['constructor', 'oid-constructor'],
      ['index/__proto__', 'oid-index-root'],
      ['index/constructor', 'oid-index-constructor'],
    ]));

    expect(Object.hasOwn(result.treeOids, '__proto__')).toBe(true);
    expect(Object.hasOwn(result.treeOids, 'constructor')).toBe(true);
    expect(Object.hasOwn(result.indexShardOids, '__proto__')).toBe(true);
    expect(Object.hasOwn(result.indexShardOids, 'constructor')).toBe(true);
    expect(result.treeOids['__proto__']).toBe('oid-root');
    expect(result.indexShardOids['__proto__']).toBe('oid-index-root');
    expect(Object.prototype).not.toHaveProperty('oid-root');
  });

  it('partitions index shard paths without prototype side effects', () => {
    const result = partitionShardOids(Object.fromEntries([
      ['__proto__', 'oid-index-root'],
      ['constructor', 'oid-index-constructor'],
      ['props___proto__', 'oid-prop-root'],
      ['props_constructor', 'oid-prop-constructor'],
    ]));

    expect(Object.hasOwn(result.indexOids, '__proto__')).toBe(true);
    expect(Object.hasOwn(result.indexOids, 'constructor')).toBe(true);
    expect(Object.hasOwn(result.propOids, 'props___proto__')).toBe(true);
    expect(Object.hasOwn(result.propOids, 'props_constructor')).toBe(true);
    expect(result.indexOids['__proto__']).toBe('oid-index-root');
    expect(result.propOids['props___proto__']).toBe('oid-prop-root');
    expect(Object.prototype).not.toHaveProperty('oid-index-root');
  });
});
