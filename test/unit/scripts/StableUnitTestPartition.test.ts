import { describe, expect, it } from 'vitest';
import StableUnitTestPartition from '../../../scripts/StableUnitTestPartition.ts';

const contract = 'test/contract/NeighborProviderPort.contract.test.ts';
const first = 'test/unit/new-area/first.test.ts';
const second = 'test/unit/domain/new-area/second.test.ts';

describe('StableUnitTestPartition', () => {
  it('covers newly introduced directories in the existing six bounded groups', () => {
    const inventory = [first, second, 'test/unit/infrastructure/new-area/io.spec.mts',
      'test/unit/scripts/new-area/gate.test.ts', 'test/unit/domain/services/root.test.ts',
      'test/unit/domain/services/new-area/nested/flow.test.ts'];
    const partition = StableUnitTestPartition.fromInventory(inventory.reverse());
    expect(partition.shards.map((shard) => [shard.name, shard.paths])).toEqual([
      ['unit-small-surfaces', [contract, first]],
      ['unit-infrastructure', ['test/unit/infrastructure/new-area/io.spec.mts']],
      ['unit-scripts', ['test/unit/scripts/new-area/gate.test.ts']],
      ['unit-domain-core', [second]],
      ['unit-domain-services-root', ['test/unit/domain/services/root.test.ts']],
      ['unit-domain-services-subdirs', ['test/unit/domain/services/new-area/nested/flow.test.ts']],
    ]);
  });

  it('omits empty groups so they cannot invoke Vitest without a test-path filter', () => {
    expect(StableUnitTestPartition.fromInventory([]).shards).toEqual([
      { name: 'unit-small-surfaces', paths: [contract] },
    ]);
  });

  it('refuses overlap before a partition can be consumed', () => {
    expect(() => new StableUnitTestPartition([first], [
      { name: 'one', paths: [first, contract] }, { name: 'two', paths: [first] },
    ])).toThrow(`duplicate shard path ${first}`);
  });

  it('refuses an incomplete partition, including omission of the explicit contract', () => {
    expect(() => new StableUnitTestPartition([first, second], [
      { name: 'one', paths: [first] },
    ])).toThrow(`missing shard paths ${second}, ${contract}`);
  });

  it('refuses test paths outside the discovered inventory and explicit contract', () => {
    expect(() => new StableUnitTestPartition([first], [
      { name: 'one', paths: [first, contract, second] },
    ])).toThrow(`unexpected shard path ${second}`);
  });

  it('owns and freezes the admitted partition against later caller mutation', () => {
    const paths = [first, contract];
    const shards = [{ name: 'one', paths }];
    const partition = new StableUnitTestPartition([first], shards);
    paths.push(second);
    shards.push({ name: 'two', paths: [second] });
    expect(partition.shards).toEqual([{ name: 'one', paths: [first, contract] }]);
    expect(Object.isFrozen(partition)).toBe(true);
    expect(Object.isFrozen(partition.shards)).toBe(true);
    for (const shard of partition.shards) {
      expect(Object.isFrozen(shard)).toBe(true);
      expect(Object.isFrozen(shard.paths)).toBe(true);
    }
  });
});
