export type UnitTestShard = Readonly<{
  name: string;
  paths: readonly string[];
}>;

const SMALL = 'unit-small-surfaces';
const INFRASTRUCTURE = 'unit-infrastructure';
const SCRIPTS = 'unit-scripts';
const DOMAIN = 'unit-domain-core';
const SERVICES_ROOT = 'unit-domain-services-root';
const SERVICES_SUBDIRECTORIES = 'unit-domain-services-subdirs';
const SHARD_NAMES = [SMALL, INFRASTRUCTURE, SCRIPTS, DOMAIN, SERVICES_ROOT, SERVICES_SUBDIRECTORIES];
const SERVICES_PREFIX = 'test/unit/domain/services/';
const CONTRACT_TEST = 'test/contract/NeighborProviderPort.contract.test.ts';

/** An owned, exhaustive, non-overlapping partition of discovered unit tests and the explicit contract. */
export default class StableUnitTestPartition {
  readonly shards: readonly UnitTestShard[];

  constructor(inventory: readonly string[], shards: readonly UnitTestShard[]) {
    assertCompletePartition(inventory, shards);
    this.shards = Object.freeze(shards.map((shard) => Object.freeze({
      name: shard.name, paths: Object.freeze([...shard.paths]),
    })));
    Object.freeze(this);
  }

  static fromInventory(inventory: readonly string[]): StableUnitTestPartition {
    const paths = [...inventory, CONTRACT_TEST].sort();
    const shards = SHARD_NAMES.map((name) => ({
      name, paths: paths.filter((path) => shardName(path) === name),
    })).filter((shard) => shard.paths.length > 0);
    return new StableUnitTestPartition(inventory, shards);
  }
}

function shardName(path: string): string {
  if (path.startsWith(SERVICES_PREFIX)) { return servicesShard(path); }
  if (path.startsWith('test/unit/domain/')) { return DOMAIN; }
  if (path.startsWith('test/unit/infrastructure/')) { return INFRASTRUCTURE; }
  if (path.startsWith('test/unit/scripts/')) { return SCRIPTS; }
  return SMALL;
}

function servicesShard(path: string): string {
  return path.slice(SERVICES_PREFIX.length).includes('/') ? SERVICES_SUBDIRECTORIES : SERVICES_ROOT;
}

function assertCompletePartition(inventory: readonly string[], shards: readonly UnitTestShard[]): void {
  const expected = new Set([...inventory, CONTRACT_TEST]);
  const seen = new Set<string>();
  for (const path of shards.flatMap((shard) => shard.paths)) {
    if (seen.has(path)) { throw new Error(`stable-unit-tests: duplicate shard path ${path}`); }
    if (!expected.has(path)) { throw new Error(`stable-unit-tests: unexpected shard path ${path}`); }
    seen.add(path);
  }
  const missing = [...expected].filter((path) => !seen.has(path));
  if (missing.length > 0) { throw new Error(`stable-unit-tests: missing shard paths ${missing.join(', ')}`); }
}
