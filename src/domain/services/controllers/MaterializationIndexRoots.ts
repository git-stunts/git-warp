import type IndexStorePort from '../../../ports/IndexStorePort.ts';
import type { IndexShardWriteOptions } from '../../../ports/IndexStorePort.ts';
import {
  DEPENDENT_ARTIFACT_ADMISSION_MAX_OPERATIONS,
  type default as ArtifactStagingPort,
} from '../../../ports/ArtifactStagingPort.ts';
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

export type MaterializationIndexRootPlanOptions = Readonly<{
  state: WarpState;
  store: IndexStorePort | undefined;
  existingPropertyRoot?: MaterializationRoot;
  existingIndexRoot?: MaterializationRoot;
}>;

type PreparedIndexRoot =
  | Readonly<{
    kind: 'resolved';
    root: MaterializationRoot;
  }>
  | Readonly<{
    kind: 'write';
    shards: readonly IndexShard[];
    options: IndexShardWriteOptions;
    store: IndexStorePort;
  }>;

/** Prepared bounded index work that can join a wider artifact admission. */
export class MaterializationIndexRootPlan {
  readonly #properties: PreparedIndexRoot;
  readonly #roaringIndexes: PreparedIndexRoot;

  private constructor(
    properties: PreparedIndexRoot,
    roaringIndexes: PreparedIndexRoot,
  ) {
    this.#properties = properties;
    this.#roaringIndexes = roaringIndexes;
  }

  static create(options: MaterializationIndexRootPlanOptions): MaterializationIndexRootPlan {
    return new MaterializationIndexRootPlan(
      preparePropertyRoot(options),
      prepareIndexRoot(options),
    );
  }

  get admissionOperationBound(): number {
    return preparedRootOperationBound(this.#properties) +
      preparedRootOperationBound(this.#roaringIndexes);
  }

  get admissionGroupCount(): number {
    return Number(this.#properties.kind === 'write') +
      Number(this.#roaringIndexes.kind === 'write');
  }

  async admit(
    workspace: MaterializationWorkspacePort,
  ): Promise<PreparedMaterializationIndexRoots> {
    if (
      workspace.admitDependentArtifacts !== undefined &&
      this.admissionGroupCount > 1 &&
      this.admissionOperationBound <= DEPENDENT_ARTIFACT_ADMISSION_MAX_OPERATIONS
    ) {
      return await workspace.admitDependentArtifacts(
        async (staging) => await this.write(staging),
        {
          maxOperations: this.admissionOperationBound,
          retain: retainedIndexRootHandles,
        },
      );
    }
    return await this.write(workspace);
  }

  async write(staging: ArtifactStagingPort): Promise<PreparedMaterializationIndexRoots> {
    return Object.freeze({
      properties: await writePreparedRoot(this.#properties, staging),
      roaringIndexes: await writePreparedRoot(this.#roaringIndexes, staging),
    });
  }
}

/** Stages bounded page-backed logical and property roots in one materialization workspace. */
export async function prepareMaterializationIndexRoots(args: {
  readonly state: WarpState;
  readonly store: IndexStorePort | undefined;
  readonly workspace: MaterializationWorkspacePort;
  readonly existingPropertyRoot?: MaterializationRoot;
  readonly existingIndexRoot?: MaterializationRoot;
}): Promise<PreparedMaterializationIndexRoots> {
  return await MaterializationIndexRootPlan.create(args).admit(args.workspace);
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

function prepareIndexRoot(args: {
  readonly state: WarpState;
  readonly store: IndexStorePort | undefined;
  readonly existingIndexRoot?: MaterializationRoot;
}): PreparedIndexRoot {
  const reusable = reusableRoot(args.existingIndexRoot);
  if (reusable !== null) {
    return reusable;
  }
  if (args.store === undefined) {
    return resolvedRoot(MaterializationRoot.unavailable());
  }
  return prepareIndexWrite(args.state, args.store);
}

function prepareIndexWrite(state: WarpState, store: IndexStorePort): PreparedIndexRoot {
  const shards = new LogicalIndexBuildService()
    .buildShards(state)
    .shards
    .filter((shard) => !(shard instanceof PropertyShard));
  const shardCount = requireMaterializationIndexShardCount(shards.length);
  return Object.freeze({
    kind: 'write',
    shards: Object.freeze(shards),
    store,
    options: Object.freeze({
      expectedShardCount: shardCount,
      memberStorage: 'page',
      maxShardCount: MAX_MATERIALIZATION_INDEX_SHARDS,
      maxShardBytes: MATERIALIZATION_INDEX_SHARD_LIMITS.maxBytes,
      structureLimits: MATERIALIZATION_INDEX_SHARD_LIMITS.structureLimits,
    }),
  });
}

function preparePropertyRoot(args: {
  readonly state: WarpState;
  readonly store: IndexStorePort | undefined;
  readonly existingPropertyRoot?: MaterializationRoot;
}): PreparedIndexRoot {
  const reusable = reusableRoot(args.existingPropertyRoot);
  if (reusable !== null) {
    return reusable;
  }
  if (args.store === undefined) {
    return resolvedRoot(MaterializationRoot.unavailable());
  }
  return preparePropertyWrite(args.state, args.store);
}

function preparePropertyWrite(state: WarpState, store: IndexStorePort): PreparedIndexRoot {
  const builder = buildMaterializationPropertyIndex(state);
  const shardCount = builder.shardCount();
  if (shardCount === 0) {
    return resolvedRoot(MaterializationRoot.empty());
  }
  requireMaterializationPropertyShardCount(shardCount);
  return Object.freeze({
    kind: 'write',
    shards: Object.freeze([...builder.yieldShards()]),
    store,
    options: Object.freeze({
      expectedShardCount: shardCount,
      memberStorage: 'page',
      maxShardCount: MAX_MATERIALIZATION_PROPERTY_SHARDS,
      maxShardBytes: MATERIALIZATION_PROPERTY_SHARD_LIMITS.maxBytes,
      structureLimits: MATERIALIZATION_PROPERTY_SHARD_LIMITS.structureLimits,
    }),
  });
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

function preparedRootOperationBound(prepared: PreparedIndexRoot): number {
  return prepared.kind === 'write' ? prepared.shards.length + 1 : 0;
}

async function writePreparedRoot(
  prepared: PreparedIndexRoot,
  staging: ArtifactStagingPort,
): Promise<MaterializationRoot> {
  if (prepared.kind === 'resolved') {
    return prepared.root;
  }
  const handle = await prepared.store.writeShards(
    WarpStream.from<IndexShard>(prepared.shards),
    { ...prepared.options, staging },
  );
  return MaterializationRoot.retained(handle);
}

function resolvedRoot(root: MaterializationRoot): PreparedIndexRoot {
  return Object.freeze({ kind: 'resolved', root });
}

function reusableRoot(root: MaterializationRoot | undefined): PreparedIndexRoot | null {
  return root === undefined || root.status === 'unavailable'
    ? null
    : resolvedRoot(root);
}

function retainedIndexRootHandles(
  prepared: PreparedMaterializationIndexRoots,
): readonly string[] {
  return Object.freeze(
    [prepared.properties.handle, prepared.roaringIndexes.handle]
      .filter((handle) => handle !== null)
      .map((handle) => handle.toString()),
  );
}
