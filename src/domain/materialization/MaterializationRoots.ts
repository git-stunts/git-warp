import WarpError from '../errors/WarpError.ts';
import BundleHandle from '../storage/BundleHandle.ts';

export const MATERIALIZATION_ROOT_NAMES = defineRootNames(
  'adjacency',
  'edge-alive',
  'edge-births',
  'frontier',
  'node-alive',
  'properties',
  'provenance-support',
  'roaring-indexes',
);

export type MaterializationRootName = (typeof MATERIALIZATION_ROOT_NAMES)[number];

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
  private readonly handles: Readonly<Record<MaterializationRootName, BundleHandle>>;
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
    this.handles = Object.freeze({
      adjacency: requireBundle(options.adjacency, 'adjacency'),
      'edge-alive': requireBundle(options.edgeAlive, 'edgeAlive'),
      'edge-births': requireBundle(options.edgeBirths, 'edgeBirths'),
      frontier: requireBundle(options.frontier, 'frontier'),
      'node-alive': requireBundle(options.nodeAlive, 'nodeAlive'),
      properties: requireBundle(options.properties, 'properties'),
      'provenance-support': requireBundle(options.provenanceSupport, 'provenanceSupport'),
      'roaring-indexes': requireBundle(options.roaringIndexes, 'roaringIndexes'),
    } satisfies Record<MaterializationRootName, BundleHandle>);
    this.adjacency = this.handles.adjacency;
    this.edgeAlive = this.handles['edge-alive'];
    this.edgeBirths = this.handles['edge-births'];
    this.frontier = this.handles.frontier;
    this.nodeAlive = this.handles['node-alive'];
    this.properties = this.handles.properties;
    this.provenanceSupport = this.handles['provenance-support'];
    this.roaringIndexes = this.handles['roaring-indexes'];
    Object.freeze(this);
  }

  entries(): readonly (readonly [MaterializationRootName, BundleHandle])[] {
    return Object.freeze(
      MATERIALIZATION_ROOT_NAMES.map((name) => rootEntry(name, this.handles[name])),
    );
  }
}

function rootEntry(
  name: MaterializationRootName,
  handle: BundleHandle,
): readonly [MaterializationRootName, BundleHandle] {
  return Object.freeze([name, handle]);
}

function defineRootNames<const Names extends readonly string[]>(...names: Names): Names {
  Object.freeze(names);
  return names;
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
