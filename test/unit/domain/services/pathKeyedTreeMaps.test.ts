import { describe, expect, it } from 'vitest';

import { partitionShardHandles } from '../../../../src/domain/services/MaterializedViewHelpers.ts';
import AssetHandle from '../../../../src/domain/storage/AssetHandle.ts';

describe('path-keyed shard handle maps', () => {
  it('partitions semantic shard handles without prototype side effects', () => {
    const indexRoot = new AssetHandle('index:root');
    const indexConstructor = new AssetHandle('index:constructor');
    const propRoot = new AssetHandle('property:root');
    const propConstructor = new AssetHandle('property:constructor');

    const result = partitionShardHandles(Object.fromEntries([
      ['__proto__', indexRoot],
      ['constructor', indexConstructor],
      ['props___proto__', propRoot],
      ['props_constructor', propConstructor],
    ]));

    expect(Object.hasOwn(result.indexHandles, '__proto__')).toBe(true);
    expect(Object.hasOwn(result.indexHandles, 'constructor')).toBe(true);
    expect(Object.hasOwn(result.propHandles, 'props___proto__')).toBe(true);
    expect(Object.hasOwn(result.propHandles, 'props_constructor')).toBe(true);
    expect(result.indexHandles['__proto__']).toBe(indexRoot);
    expect(result.indexHandles.constructor).toBe(indexConstructor);
    expect(result.propHandles['props___proto__']).toBe(propRoot);
    expect(Object.prototype).not.toHaveProperty('index:root');
  });
});
