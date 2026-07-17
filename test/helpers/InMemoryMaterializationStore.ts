import MaterializationHandle from '../../src/domain/materialization/MaterializationHandle.ts';
import type MaterializationCoordinate from '../../src/domain/materialization/MaterializationCoordinate.ts';
import BundleHandle from '../../src/domain/storage/BundleHandle.ts';
import StorageRetentionWitness, {
  StorageRetentionRoot,
} from '../../src/domain/storage/StorageRetentionWitness.ts';
import MaterializationStorePort, {
  type MaterializationAcquisition,
  type RetainMaterializationRequest,
} from '../../src/ports/MaterializationStorePort.ts';
import MaterializationWorkspacePort, {
  type MaterializationWorkspaceRoots,
  type PromoteMaterializationRequest,
} from '../../src/ports/MaterializationWorkspacePort.ts';

export class InMemoryMaterializationWorkspace extends MaterializationWorkspacePort {
  readonly checkpoints: MaterializationWorkspaceRoots[] = [];
  readonly #promoteMaterialization: (
    request: PromoteMaterializationRequest,
  ) => Promise<MaterializationHandle>;
  released = false;

  constructor(
    promoteMaterialization: (
      request: PromoteMaterializationRequest,
    ) => Promise<MaterializationHandle>,
  ) {
    super();
    this.#promoteMaterialization = promoteMaterialization;
  }

  override checkpoint(roots: MaterializationWorkspaceRoots): Promise<StorageRetentionWitness> {
    this.checkpoints.push(roots);
    const bundle = new BundleHandle(`test:workspace:${String(this.checkpoints.length)}`);
    return Promise.resolve(workspaceRetentionWitness(bundle));
  }

  override release(): Promise<void> {
    this.released = true;
    return Promise.resolve();
  }

  override promote(request: PromoteMaterializationRequest): Promise<MaterializationHandle> {
    return this.#promoteMaterialization(request);
  }
}

export class InMemoryMaterializationAcquisition implements MaterializationAcquisition {
  readonly materialization: MaterializationHandle;
  readonly acquiredAt = '1970-01-01T00:00:00.000Z';
  releaseCalls = 0;
  released = false;

  constructor(materialization: MaterializationHandle) {
    this.materialization = materialization;
  }

  release(): Promise<void> {
    this.releaseCalls += 1;
    this.released = true;
    return Promise.resolve();
  }
}

/** Behavioral retained-materialization store for controller tests. */
export default class InMemoryMaterializationStore extends MaterializationStorePort {
  readonly acquisitions: InMemoryMaterializationAcquisition[] = [];
  readonly exactLookups: MaterializationCoordinate[] = [];
  readonly retainedRequests: RetainMaterializationRequest[] = [];
  readonly workspaces: InMemoryMaterializationWorkspace[] = [];
  readonly #handles = new Map<string, MaterializationHandle>();
  #nextHandle = 1;

  override openWorkspace(
    coordinate: MaterializationCoordinate,
  ): Promise<MaterializationWorkspacePort> {
    const workspace = new InMemoryMaterializationWorkspace(async (request) => {
      if (!request.coordinate.equals(coordinate)) {
        throw new Error('Workspace promotion coordinate mismatch');
      }
      return await this.retain(request);
    });
    this.workspaces.push(workspace);
    return Promise.resolve(workspace);
  }

  override retain(request: RetainMaterializationRequest): Promise<MaterializationHandle> {
    this.retainedRequests.push(request);
    const bundle = new BundleHandle(`test:materialization:${this.#nextHandle}`);
    this.#nextHandle += 1;
    const handle = new MaterializationHandle({
      laneName: 'test-lane',
      bundle,
      coordinate: request.coordinate,
      roots: request.roots,
      stateHash: request.stateHash,
      retention: retentionWitness(bundle),
    });
    this.#handles.set(coordinateKey(request.coordinate), handle);
    return Promise.resolve(handle);
  }

  override acquireExact(
    coordinate: MaterializationCoordinate,
  ): Promise<MaterializationAcquisition | null> {
    this.exactLookups.push(coordinate);
    const handle = this.#handles.get(coordinateKey(coordinate));
    if (handle === undefined) {
      return Promise.resolve(null);
    }
    const acquisition = new InMemoryMaterializationAcquisition(handle);
    this.acquisitions.push(acquisition);
    return Promise.resolve(acquisition);
  }
}

function coordinateKey(coordinate: MaterializationCoordinate): string {
  return JSON.stringify({
    ceiling: coordinate.ceiling,
    frontier: coordinate.frontierEntries,
  });
}

function retentionWitness(handle: BundleHandle): StorageRetentionWitness {
  return new StorageRetentionWitness({
    handle,
    policy: 'evictable',
    reachability: 'anchored',
    root: new StorageRetentionRoot({
      kind: 'cache-set',
      namespace: 'test/materializations',
      locator: 'test/materializations',
      generation: 'test-generation',
      path: handle.toString(),
    }),
    observedAt: '1970-01-01T00:00:00.000Z',
  });
}

export function workspaceRetentionWitness(
  handle: BundleHandle,
  options: {
    readonly namespace?: string;
    readonly generation?: string;
  } = {},
): StorageRetentionWitness {
  const namespace = options.namespace ?? 'test/materialization-workspaces';
  return new StorageRetentionWitness({
    handle,
    policy: 'pinned',
    reachability: 'anchored',
    root: new StorageRetentionRoot({
      kind: 'cache-set',
      namespace,
      locator: namespace,
      generation: options.generation ?? 'test-workspace-generation',
      path: handle.toString(),
    }),
    observedAt: '1970-01-01T00:00:00.000Z',
  });
}
