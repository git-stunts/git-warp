import type { OpticReadFailureCauseValue } from './OpticReadFailureCause.ts';
import QueryError from '../../errors/QueryError.ts';
import type AssetHandle from '../../storage/AssetHandle.ts';
import type BundleHandle from '../../storage/BundleHandle.ts';
import type { IndexShardReference } from '../../../ports/IndexStorePort.ts';
import type { CheckpointBasis } from '../../../ports/CheckpointStorePort.ts';
import { partitionShardHandles } from '../MaterializedViewHelpers.ts';
import { isCurrentCheckpointSchema } from '../state/checkpointHelpers.ts';
import { isStaleCheckpointMaterialization } from '../state/StaleCheckpointMaterialization.ts';
import CheckpointBasisManifest, {
  CheckpointBasisChunking,
  CheckpointBasisCompleteness,
  CheckpointBasisShardGeometry,
  CheckpointBasisShardRootMap,
  CheckpointBasisSupportPosture,
} from './CheckpointBasisManifest.ts';
import type CheckpointTailOpticSource from './CheckpointTailOpticSource.ts';

export type CheckpointTailShardIdentityMap = {
  readonly [path: string]: string;
};

export type CheckpointTailIndexBasis = {
  readonly checkpointSha: string;
  readonly schema: number;
  readonly frontier: Map<string, string>;
  readonly manifest: CheckpointBasisManifest;
  readonly indexHandles: Readonly<Record<string, AssetHandle>>;
  readonly propHandles: Readonly<Record<string, AssetHandle>>;
  readonly indexRoot: BundleHandle | null;
  readonly propertyRoot: BundleHandle | null;
  readonly indexReferences: Readonly<Record<string, IndexShardReference>>;
  readonly propReferences: Readonly<Record<string, IndexShardReference>>;
};

/** Node liveness bitmaps, and the node lifecycle records beside them. */
const NODE_LIVENESS_PREFIXES: readonly string[] = Object.freeze(['meta_', 'life_']);
/** Index members of the liveness and adjacency families; the rest are edge facts. */
const NON_EDGE_FACT_PREFIXES: readonly string[] = Object.freeze([...NODE_LIVENESS_PREFIXES, 'fwd_', 'rev_']);

const capturedBasisLoads = new WeakMap<
  CheckpointTailBasisLoader,
  Promise<CheckpointTailIndexBasis>
>();

type CheckpointTailManifestRoots = {
  readonly livenessRoots: CheckpointBasisShardRootMap;
  readonly propertyRoots: CheckpointBasisShardRootMap;
  readonly outgoingAdjacencyRoots: CheckpointBasisShardRootMap;
  readonly incomingAdjacencyRoots: CheckpointBasisShardRootMap;
  readonly edgeFactRoots: CheckpointBasisShardRootMap;
};

export default class CheckpointTailBasisLoader {
  private readonly _cache: boolean;
  private readonly _source: CheckpointTailOpticSource;

  constructor(options: {
    readonly cache?: boolean;
    readonly source: CheckpointTailOpticSource;
  }) {
    this._cache = options.cache ?? false;
    this._source = options.source;
    Object.freeze(this);
  }

  async load(): Promise<CheckpointTailIndexBasis> {
    if (!this._cache) {
      return await this._loadFresh();
    }
    const cached = capturedBasisLoads.get(this);
    if (cached !== undefined) {
      return await cached;
    }
    const pending = this._loadFresh();
    capturedBasisLoads.set(this, pending);
    try {
      return await pending;
    } catch (error) {
      capturedBasisLoads.delete(this);
      throw error;
    }
  }

  private async _loadFresh(): Promise<CheckpointTailIndexBasis> {
    const checkpointSha = await this._readCheckpointSha();
    const basis = await this._loadCheckpointBasis(checkpointSha);
    if (!isCurrentCheckpointSchema(basis.schema)) {
      throwNoBoundedBasis(this._source.graphName, 'checkpoint-without-index-tree');
    }
    const shards = await loadBasisShards(this._source, basis);
    if (shardReferenceCount(shards) === 0) {
      throwNoBoundedBasis(this._source.graphName, 'checkpoint-missing-index-shards');
    }
    return createIndexBasis({
      source: this._source,
      checkpointSha,
      basis,
      shards,
    });
  }

  private async _loadCheckpointBasis(checkpointSha: string): Promise<CheckpointBasis> {
    try {
      return await this._source._checkpointStore.loadBasis(checkpointSha, this._source.graphName);
    } catch (error) {
      if (error instanceof Error && isStaleCheckpointMaterialization(error)) {
        throwNoBoundedBasis(this._source.graphName, 'checkpoint-without-index-tree');
      }
      throw error;
    }
  }

  private async _readCheckpointSha(): Promise<string> {
    const checkpointSha = await this._source._readCheckpointSha();
    if (checkpointSha === null) {
      throwNoBoundedBasis(this._source.graphName, 'missing-checkpoint');
    }
    return checkpointSha;
  }

}

type LoadedBasisShards = Pick<
  CheckpointTailIndexBasis,
  'indexHandles' | 'propHandles' | 'indexReferences' | 'propReferences'
>;

function createIndexBasis(options: {
  source: CheckpointTailOpticSource;
  checkpointSha: string;
  basis: CheckpointBasis;
  shards: LoadedBasisShards;
}): CheckpointTailIndexBasis {
  const { source, checkpointSha, basis, shards } = options;
  return {
    checkpointSha,
    schema: basis.schema,
    frontier: basis.frontier,
    manifest: createManifest({
      graphName: source.graphName,
      checkpointSha,
      frontier: basis.frontier,
      schema: basis.schema,
      indexOids: referenceIdentities(shards.indexReferences),
      propOids: referenceIdentities(shards.propReferences),
    }),
    ...shards,
    indexRoot: basis.indexRoot,
    propertyRoot: basis.propertyRoot,
  };
}

async function loadBasisShards(
  source: CheckpointTailOpticSource,
  basis: CheckpointBasis,
): Promise<LoadedBasisShards> {
  const { indexHandles, propHandles } = partitionShardHandles(basis.indexShardHandles);
  return {
    indexHandles,
    propHandles,
    indexReferences: basis.indexRoot === null
      ? handleReferences(indexHandles)
      : await source._indexStore.readShardReferences(basis.indexRoot),
    propReferences: basis.propertyRoot === null
      ? handleReferences(propHandles)
      : await source._indexStore.readShardReferences(basis.propertyRoot),
  };
}

function shardReferenceCount(shards: LoadedBasisShards): number {
  return Object.keys(shards.indexReferences).length
    + Object.keys(shards.propReferences).length;
}

function createManifest(options: {
  readonly graphName: string;
  readonly checkpointSha: string;
  readonly frontier: Map<string, string>;
  readonly schema: number;
  readonly indexOids: CheckpointTailShardIdentityMap;
  readonly propOids: CheckpointTailShardIdentityMap;
}): CheckpointBasisManifest {
  const roots = createManifestRoots(options.indexOids, options.propOids);
  const shardCount = manifestShardCount(roots);
  return new CheckpointBasisManifest({
    schema: options.schema,
    graphName: options.graphName,
    checkpointSha: options.checkpointSha,
    frontier: options.frontier,
    appliedVersionVector: appliedVersionVectorFromFrontier(options.frontier),
    basisIdentity: `basis:${options.graphName}:${options.checkpointSha}:checkpoint-tail-index`,
    semanticReadingIdentity: `reading-basis:${options.graphName}:${options.checkpointSha}:node-property-optics`,
    ...roots,
    provenancePosture: CheckpointBasisSupportPosture.unavailable('checkpoint-tail-provenance-root-unavailable'),
    contentAnchorPosture: CheckpointBasisSupportPosture.unavailable('checkpoint-tail-content-root-unavailable'),
    shardGeometry: checkpointShardGeometry(shardCount),
    chunking: checkpointChunking(shardCount),
    completeness: CheckpointBasisCompleteness.complete(),
  });
}

function createManifestRoots(
  indexOids: CheckpointTailShardIdentityMap,
  propOids: CheckpointTailShardIdentityMap,
): CheckpointTailManifestRoots {
  return {
    livenessRoots: rootsForPrefixes('node-liveness', indexOids, NODE_LIVENESS_PREFIXES),
    propertyRoots: new CheckpointBasisShardRootMap({
      family: 'node-property',
      roots: shardOidMapToMap(propOids),
    }),
    outgoingAdjacencyRoots: rootsForPrefixes('outgoing-adjacency', indexOids, ['fwd_']),
    incomingAdjacencyRoots: rootsForPrefixes('incoming-adjacency', indexOids, ['rev_']),
    edgeFactRoots: edgeFactRootsFromIndex(indexOids),
  };
}

function manifestShardCount(roots: CheckpointTailManifestRoots): number {
  return Math.max(
    1,
    roots.livenessRoots.size
      + roots.propertyRoots.size
      + roots.outgoingAdjacencyRoots.size
      + roots.incomingAdjacencyRoots.size
      + roots.edgeFactRoots.size,
  );
}

function checkpointShardGeometry(shardCount: number): CheckpointBasisShardGeometry {
  return new CheckpointBasisShardGeometry({
    layoutFamily: 'checkpoint-tail-index-shards',
    payloadLayout: 'checkpoint-schema-5-index',
    shardKeyStrategy: 'hex-prefix-2',
    shardCount,
  });
}

function checkpointChunking(shardCount: number): CheckpointBasisChunking {
  return new CheckpointBasisChunking({ maxFactsPerShard: shardCount, chunkCount: 1 });
}

function rootsForPrefixes(
  family: 'node-liveness' | 'outgoing-adjacency' | 'incoming-adjacency',
  source: CheckpointTailShardIdentityMap,
  prefixes: readonly string[],
): CheckpointBasisShardRootMap {
  const roots = new Map<string, string>();
  for (const [path, oid] of Object.entries(source)) {
    if (prefixes.some((prefix) => path.startsWith(prefix))) {
      roots.set(path, oid);
    }
  }
  return new CheckpointBasisShardRootMap({ family, roots });
}

function edgeFactRootsFromIndex(source: CheckpointTailShardIdentityMap): CheckpointBasisShardRootMap {
  const roots = new Map<string, string>();
  for (const [path, oid] of Object.entries(source)) {
    if (!NON_EDGE_FACT_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      roots.set(path, oid);
    }
  }
  return new CheckpointBasisShardRootMap({ family: 'edge-fact', roots });
}

function shardOidMapToMap(source: CheckpointTailShardIdentityMap): Map<string, string> {
  return new Map(Object.entries(source).sort(([left], [right]) => left.localeCompare(right)));
}

function appliedVersionVectorFromFrontier(frontier: Map<string, string>): Map<string, number> {
  const versionVector = new Map<string, number>();
  for (const writerId of [...frontier.keys()].sort()) {
    versionVector.set(writerId, 0);
  }
  return versionVector;
}

function handleReferences(
  handles: Readonly<Record<string, AssetHandle>>,
): Readonly<Record<string, IndexShardReference>> {
  return Object.freeze(Object.fromEntries(
    Object.entries(handles).map(([path, handle]) => [
      path,
      Object.freeze({ kind: 'asset' as const, token: handle.toString() }),
    ]),
  ));
}

function referenceIdentities(
  references: Readonly<Record<string, IndexShardReference>>,
): CheckpointTailShardIdentityMap {
  return Object.freeze(Object.fromEntries(
    Object.entries(references).map(([path, reference]) => [path, reference.token]),
  ));
}

function throwNoBoundedBasis(graphName: string, reason: OpticReadFailureCauseValue): never {
  throw new QueryError('No bounded checkpoint-tail optic basis is available.', {
    code: 'E_OPTIC_NO_BOUNDED_BASIS',
    context: { graphName, reason },
  });
}
