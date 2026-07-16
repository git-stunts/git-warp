import MaterializationHandle from '../../src/domain/materialization/MaterializationHandle.ts';
import type MaterializationCoordinate from '../../src/domain/materialization/MaterializationCoordinate.ts';
import BundleHandle from '../../src/domain/storage/BundleHandle.ts';
import StorageRetentionWitness, {
  StorageRetentionRoot,
} from '../../src/domain/storage/StorageRetentionWitness.ts';
import MaterializationStorePort, {
  type RetainMaterializationRequest,
} from '../../src/ports/MaterializationStorePort.ts';

/** Behavioral retained-materialization store for controller tests. */
export default class InMemoryMaterializationStore extends MaterializationStorePort {
  readonly exactLookups: MaterializationCoordinate[] = [];
  readonly retainedRequests: RetainMaterializationRequest[] = [];
  readonly #handles = new Map<string, MaterializationHandle>();
  #nextHandle = 1;

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
