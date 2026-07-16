import WarpError from '../errors/WarpError.ts';
import BundleHandle from '../storage/BundleHandle.ts';

export type MaterializationRootName =
  | 'adjacency'
  | 'edge-alive'
  | 'edge-births'
  | 'frontier'
  | 'node-alive'
  | 'properties'
  | 'provenance-support'
  | 'roaring-indexes';

export type MaterializationRootsOptions = Readonly<{
  adjacency: BundleHandle;
  edgeAlive: BundleHandle;
  edgeBirths: BundleHandle;
  frontier: BundleHandle;
  nodeAlive: BundleHandle;
  properties: BundleHandle;
  provenanceSupport: BundleHandle;
  roaringIndexes: BundleHandle;
}>;

/** Independently addressable retained roots for one materialized causal chart. */
export default class MaterializationRoots {
  readonly adjacency: BundleHandle;
  readonly edgeAlive: BundleHandle;
  readonly edgeBirths: BundleHandle;
  readonly frontier: BundleHandle;
  readonly nodeAlive: BundleHandle;
  readonly properties: BundleHandle;
  readonly provenanceSupport: BundleHandle;
  readonly roaringIndexes: BundleHandle;

  constructor(options: MaterializationRootsOptions) {
    requireOptions(options);
    this.adjacency = requireBundle(options.adjacency, 'adjacency');
    this.edgeAlive = requireBundle(options.edgeAlive, 'edgeAlive');
    this.edgeBirths = requireBundle(options.edgeBirths, 'edgeBirths');
    this.frontier = requireBundle(options.frontier, 'frontier');
    this.nodeAlive = requireBundle(options.nodeAlive, 'nodeAlive');
    this.properties = requireBundle(options.properties, 'properties');
    this.provenanceSupport = requireBundle(options.provenanceSupport, 'provenanceSupport');
    this.roaringIndexes = requireBundle(options.roaringIndexes, 'roaringIndexes');
    Object.freeze(this);
  }

  entries(): readonly (readonly [MaterializationRootName, BundleHandle])[] {
    return Object.freeze([
      rootEntry('adjacency', this.adjacency),
      rootEntry('edge-alive', this.edgeAlive),
      rootEntry('edge-births', this.edgeBirths),
      rootEntry('frontier', this.frontier),
      rootEntry('node-alive', this.nodeAlive),
      rootEntry('properties', this.properties),
      rootEntry('provenance-support', this.provenanceSupport),
      rootEntry('roaring-indexes', this.roaringIndexes),
    ]);
  }
}

function rootEntry(
  name: MaterializationRootName,
  handle: BundleHandle,
): readonly [MaterializationRootName, BundleHandle] {
  return Object.freeze([name, handle]);
}

function requireBundle(handle: BundleHandle, field: string): BundleHandle {
  if (!(handle instanceof BundleHandle)) {
    throw rootsError(`${field} must be a BundleHandle`);
  }
  return handle;
}

function requireOptions(options: object): void {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw rootsError('options must be an object');
  }
}

function rootsError(message: string): WarpError {
  return new WarpError(`Materialization roots ${message}`, 'E_MATERIALIZATION_ROOTS');
}
