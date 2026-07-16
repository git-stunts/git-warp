import MaterializationHandle from '../../src/domain/materialization/MaterializationHandle.ts';
import type MaterializationCoordinate from '../../src/domain/materialization/MaterializationCoordinate.ts';
import BundleHandle from '../../src/domain/storage/BundleHandle.ts';
import StorageRetentionWitness, {
  StorageRetentionRoot,
} from '../../src/domain/storage/StorageRetentionWitness.ts';
import MaterializationStorePort, {
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

/** Behavioral retained-materialization store for controller tests. */
export default class InMemoryMaterializationStore extends MaterializationStorePort {
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

  override findExact(
    coordinate: MaterializationCoordinate,
  ): Promise<MaterializationHandle | null> {
    this.exactLookups.push(coordinate);
    return Promise.resolve(this.#handles.get(coordinateKey(coordinate)) ?? null);
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

function workspaceRetentionWitness(handle: BundleHandle): StorageRetentionWitness {
  return new StorageRetentionWitness({
    handle,
    policy: 'pinned',
    reachability: 'anchored',
    root: new StorageRetentionRoot({
      kind: 'cache-set',
      namespace: 'test/materialization-workspaces',
      locator: 'test/materialization-workspaces',
      generation: 'test-workspace-generation',
      path: handle.toString(),
    }),
    observedAt: '1970-01-01T00:00:00.000Z',
  });
}
