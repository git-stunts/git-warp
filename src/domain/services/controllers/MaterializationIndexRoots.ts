import type IndexStorePort from '../../../ports/IndexStorePort.ts';
import {
  DEPENDENT_ARTIFACT_ADMISSION_MAX_OPERATIONS,
  type default as ArtifactStagingPort,
} from '../../../ports/ArtifactStagingPort.ts';
import type MaterializationWorkspacePort from '../../../ports/MaterializationWorkspacePort.ts';
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
import PendingMaterializationIndexRootWrite
  from './PendingMaterializationIndexRootWrite.ts';
import ResolvedMaterializationIndexRoot from './ResolvedMaterializationIndexRoot.ts';

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
  | PendingMaterializationIndexRootWrite
  | ResolvedMaterializationIndexRoot;

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
    Object.freeze(this);
  }

  static create(options: MaterializationIndexRootPlanOptions): MaterializationIndexRootPlan {
    return new MaterializationIndexRootPlan(
      preparePropertyRoot(options),
      prepareIndexRoot(options),
    );
  }

  get admissionOperationBound(): number {
    return this.#properties.admissionOperationBound +
      this.#roaringIndexes.admissionOperationBound;
  }

  get admissionGroupCount(): number {
    return this.#properties.admissionGroupCount +
      this.#roaringIndexes.admissionGroupCount;
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
      properties: await this.#properties.write(staging),
      roaringIndexes: await this.#roaringIndexes.write(staging),
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
  const builder = new LogicalIndexBuildService().buildLogicalIndexBuilder(state);
  const shardCount = requireMaterializationIndexShardCount(builder.shardCount());
  return new PendingMaterializationIndexRootWrite({
    openShards: () => WarpStream.from(builder.yieldShards()),
    shardCount,
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
  return new PendingMaterializationIndexRootWrite({
    openShards: () => WarpStream.from(builder.yieldShards()),
    shardCount,
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

function resolvedRoot(root: MaterializationRoot): PreparedIndexRoot {
  return new ResolvedMaterializationIndexRoot(root);
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
