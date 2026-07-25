import type IndexStorePort from '../../../ports/IndexStorePort.ts';
import type MaterializationWorkspacePort from '../../../ports/MaterializationWorkspacePort.ts';
import type { IndexShard } from '../../artifacts/IndexShard.ts';
import { PropertyShard } from '../../artifacts/PropertyShard.ts';
import MaterializationRoot from '../../materialization/MaterializationRoot.ts';
import MaterializationRoots from '../../materialization/MaterializationRoots.ts';
import {
  MATERIALIZATION_INDEX_SHARD_LIMITS,
  MAX_MATERIALIZATION_INDEX_SHARDS,
  requireMaterializationIndexShardCount,
} from '../../materialization/MaterializationIndexProfile.ts';
import {
  materializationPropertyShardKey,
  MATERIALIZATION_PROPERTY_SHARD_LIMITS,
  MAX_MATERIALIZATION_PROPERTY_SHARDS,
  requireMaterializationPropertyShardCount,
} from '../../materialization/MaterializationPropertyProfile.ts';
import WarpStream from '../../stream/WarpStream.ts';
import LogicalIndexBuildService from '../index/LogicalIndexBuildService.ts';
import PropertyIndexBuilder from '../index/PropertyIndexBuilder.ts';
import type WarpState from '../state/WarpState.ts';

export type PreparedMaterializationIndexRoots = Readonly<{
  properties: MaterializationRoot;
  roaringIndexes: MaterializationRoot;
}>;

/** Stages bounded page-backed logical and property roots in one materialization workspace. */
export async function prepareMaterializationIndexRoots(args: {
  readonly state: WarpState;
  readonly store: IndexStorePort | undefined;
  readonly workspace: MaterializationWorkspacePort;
  readonly existingPropertyRoot?: MaterializationRoot;
  readonly existingIndexRoot?: MaterializationRoot;
}): Promise<PreparedMaterializationIndexRoots> {
  return Object.freeze({
    properties: await resolvePropertyRoot({
      state: args.state,
      store: args.store,
      workspace: args.workspace,
      existing: args.existingPropertyRoot,
    }),
    roaringIndexes: await resolveIndexRoot({
      state: args.state,
      store: args.store,
      workspace: args.workspace,
      existing: args.existingIndexRoot,
    }),
  });
}

/** Builds a whole-state descriptor whose retained derived roots are the bounded indexes. */
export function materializationRootsWithIndexes(
  prepared: PreparedMaterializationIndexRoots,
): MaterializationRoots {
  const unavailable = () => MaterializationRoot.unavailable();
  return new MaterializationRoots({
    adjacency: unavailable(),
    edgeAlive: unavailable(),
    edgeBirths: unavailable(),
    frontier: unavailable(),
    nodeAlive: unavailable(),
    properties: prepared.properties,
    provenanceSupport: unavailable(),
    replayBasis: unavailable(),
    roaringIndexes: prepared.roaringIndexes,
  });
}

async function materializeIndexRoot(
  state: WarpState,
  store: IndexStorePort | undefined,
  workspace: MaterializationWorkspacePort,
): Promise<MaterializationRoot> {
  if (store === undefined) {
    return MaterializationRoot.unavailable();
  }
  const shards = new LogicalIndexBuildService()
    .buildShards(state)
    .shards
    .filter((shard) => !(shard instanceof PropertyShard));
  const shardCount = requireMaterializationIndexShardCount(shards.length);
  const handle = await store.writeShards(
    WarpStream.from<IndexShard>(shards),
    {
      expectedShardCount: shardCount,
      memberStorage: 'page',
      maxShardCount: MAX_MATERIALIZATION_INDEX_SHARDS,
      maxShardBytes: MATERIALIZATION_INDEX_SHARD_LIMITS.maxBytes,
      structureLimits: MATERIALIZATION_INDEX_SHARD_LIMITS.structureLimits,
      staging: workspace,
    },
  );
  return MaterializationRoot.retained(handle);
}

async function resolveIndexRoot(args: {
  readonly state: WarpState;
  readonly store: IndexStorePort | undefined;
  readonly workspace: MaterializationWorkspacePort;
  readonly existing: MaterializationRoot | undefined;
}): Promise<MaterializationRoot> {
  if (args.existing !== undefined && args.existing.status !== 'unavailable') {
    return args.existing;
  }
  return await materializeIndexRoot(args.state, args.store, args.workspace);
}

async function materializePropertyRoot(
  state: WarpState,
  store: IndexStorePort | undefined,
  workspace: MaterializationWorkspacePort,
): Promise<MaterializationRoot> {
  if (store === undefined) {
    return MaterializationRoot.unavailable();
  }
  const builder = buildMaterializationPropertyIndex(state);
  const shardCount = builder.shardCount();
  if (shardCount === 0) {
    return MaterializationRoot.empty();
  }
  requireMaterializationPropertyShardCount(shardCount);
  const handle = await store.writeShards(
    WarpStream.from<IndexShard>(builder.yieldShards()),
    {
      expectedShardCount: shardCount,
      memberStorage: 'page',
      maxShardCount: MAX_MATERIALIZATION_PROPERTY_SHARDS,
      maxShardBytes: MATERIALIZATION_PROPERTY_SHARD_LIMITS.maxBytes,
      structureLimits: MATERIALIZATION_PROPERTY_SHARD_LIMITS.structureLimits,
      staging: workspace,
    },
  );
  return MaterializationRoot.retained(handle);
}

function buildMaterializationPropertyIndex(state: WarpState): PropertyIndexBuilder {
  const builder = new PropertyIndexBuilder({
    schemaVersion: 2,
    shardKey: materializationPropertyShardKey,
  });
  for (const entry of state.nodeProperties()) {
    if (state.nodeAlive.contains(entry.nodeId)) {
      builder.addProperty(entry.nodeId, entry.key, entry.register.value);
    }
  }
  return builder;
}

async function resolvePropertyRoot(args: {
  readonly state: WarpState;
  readonly store: IndexStorePort | undefined;
  readonly workspace: MaterializationWorkspacePort;
  readonly existing: MaterializationRoot | undefined;
}): Promise<MaterializationRoot> {
  if (args.existing !== undefined && args.existing.status !== 'unavailable') {
    return args.existing;
  }
  return await materializePropertyRoot(args.state, args.store, args.workspace);
}
