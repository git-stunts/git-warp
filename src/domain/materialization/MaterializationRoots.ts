import WarpError from '../errors/WarpError.ts';
import MaterializationRoot from './MaterializationRoot.ts';

export const MATERIALIZATION_ROOT_NAMES: readonly [
  'adjacency',
  'edge-alive',
  'edge-births',
  'frontier',
  'node-alive',
  'properties',
  'provenance-support',
  'replay-basis',
  'roaring-indexes',
] = defineRootNames(
  'adjacency',
  'edge-alive',
  'edge-births',
  'frontier',
  'node-alive',
  'properties',
  'provenance-support',
  'replay-basis',
  'roaring-indexes',
);

export type MaterializationRootName = (typeof MATERIALIZATION_ROOT_NAMES)[number];

export type MaterializationRootsOptions = Readonly<{
  adjacency: MaterializationRoot;
  edgeAlive: MaterializationRoot;
  edgeBirths: MaterializationRoot;
  frontier: MaterializationRoot;
  nodeAlive: MaterializationRoot;
  properties: MaterializationRoot;
  provenanceSupport: MaterializationRoot;
  replayBasis: MaterializationRoot;
  roaringIndexes: MaterializationRoot;
}>;

type MaterializationRootsByName = Readonly<{
  adjacency: MaterializationRoot;
  'edge-alive': MaterializationRoot;
  'edge-births': MaterializationRoot;
  frontier: MaterializationRoot;
  'node-alive': MaterializationRoot;
  properties: MaterializationRoot;
  'provenance-support': MaterializationRoot;
  'replay-basis': MaterializationRoot;
  'roaring-indexes': MaterializationRoot;
}>;

/** Independently addressable retained roots for one materialized causal chart. */
export default class MaterializationRoots {
  private readonly roots: MaterializationRootsByName;
  readonly adjacency: MaterializationRoot;
  readonly edgeAlive: MaterializationRoot;
  readonly edgeBirths: MaterializationRoot;
  readonly frontier: MaterializationRoot;
  readonly nodeAlive: MaterializationRoot;
  readonly properties: MaterializationRoot;
  readonly provenanceSupport: MaterializationRoot;
  readonly replayBasis: MaterializationRoot;
  readonly roaringIndexes: MaterializationRoot;

  constructor(options: MaterializationRootsOptions) {
    requireOptions(options);
    this.roots = Object.freeze({
      adjacency: requireRoot(options.adjacency, 'adjacency'),
      'edge-alive': requireRoot(options.edgeAlive, 'edgeAlive'),
      'edge-births': requireRoot(options.edgeBirths, 'edgeBirths'),
      frontier: requireRoot(options.frontier, 'frontier'),
      'node-alive': requireRoot(options.nodeAlive, 'nodeAlive'),
      properties: requireRoot(options.properties, 'properties'),
      'provenance-support': requireRoot(options.provenanceSupport, 'provenanceSupport'),
      'replay-basis': requireRoot(options.replayBasis, 'replayBasis'),
      'roaring-indexes': requireRoot(options.roaringIndexes, 'roaringIndexes'),
    } satisfies MaterializationRootsByName);
    this.adjacency = this.roots.adjacency;
    this.edgeAlive = this.roots['edge-alive'];
    this.edgeBirths = this.roots['edge-births'];
    this.frontier = this.roots.frontier;
    this.nodeAlive = this.roots['node-alive'];
    this.properties = this.roots.properties;
    this.provenanceSupport = this.roots['provenance-support'];
    this.replayBasis = this.roots['replay-basis'];
    this.roaringIndexes = this.roots['roaring-indexes'];
    Object.freeze(this);
  }

  entries(): readonly (readonly [MaterializationRootName, MaterializationRoot])[] {
    return Object.freeze(
      MATERIALIZATION_ROOT_NAMES.map((name) => rootEntry(name, this.roots[name])),
    );
  }

  withRoot(name: MaterializationRootName, root: MaterializationRoot): MaterializationRoots {
    const rootName = requireRootName(name);
    const replacement = {
      ...this.roots,
      [rootName]: requireRoot(root, rootName),
    };
    return new MaterializationRoots({
      adjacency: replacement.adjacency,
      edgeAlive: replacement['edge-alive'],
      edgeBirths: replacement['edge-births'],
      frontier: replacement.frontier,
      nodeAlive: replacement['node-alive'],
      properties: replacement.properties,
      provenanceSupport: replacement['provenance-support'],
      replayBasis: replacement['replay-basis'],
      roaringIndexes: replacement['roaring-indexes'],
    });
  }

  equals(other: MaterializationRoots): boolean {
    return other instanceof MaterializationRoots
      && MATERIALIZATION_ROOT_NAMES.every((name) => this.roots[name].equals(other.roots[name]));
  }
}

function requireRootName(name: MaterializationRootName): MaterializationRootName {
  if (!MATERIALIZATION_ROOT_NAMES.includes(name)) {
    throw rootsError(`unsupported root name: ${String(name)}`);
  }
  return name;
}

function rootEntry(
  name: MaterializationRootName,
  root: MaterializationRoot,
): readonly [MaterializationRootName, MaterializationRoot] {
  return Object.freeze([name, root]);
}

function defineRootNames<const Names extends readonly string[]>(...names: Names): Names {
  Object.freeze(names);
  return names;
}

function requireRoot(root: MaterializationRoot, field: string): MaterializationRoot {
  if (!(root instanceof MaterializationRoot)) {
    throw rootsError(`${field} must be a MaterializationRoot`);
  }
  return root;
}

function requireOptions(options: object): void {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw rootsError('options must be an object');
  }
}

function rootsError(message: string): WarpError {
  return new WarpError(`Materialization roots ${message}`, 'E_MATERIALIZATION_ROOTS');
}
