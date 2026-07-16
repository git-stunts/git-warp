import { describe, expect, it } from 'vitest';
import MaterializationCoordinate from '../../../../src/domain/materialization/MaterializationCoordinate.ts';
import MaterializationHandle from '../../../../src/domain/materialization/MaterializationHandle.ts';
import MaterializationRoots, {
  MATERIALIZATION_ROOT_NAMES,
  type MaterializationRootsOptions,
} from '../../../../src/domain/materialization/MaterializationRoots.ts';
import BundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import StorageHandle from '../../../../src/domain/storage/StorageHandle.ts';
import StorageRetentionWitness, {
  StorageRetentionRoot,
} from '../../../../src/domain/storage/StorageRetentionWitness.ts';

describe('MaterializationCoordinate', () => {
  it('freezes a sorted exact coordinate and returns defensive frontier maps', () => {
    const coordinate = new MaterializationCoordinate({
      frontier: new Map([
        ['writer-b', 'patch-b'],
        ['writer-a', 'patch-a'],
      ]),
      ceiling: 42,
    });

    expect(coordinate.frontierEntries).toEqual([
      { writerId: 'writer-a', patchSha: 'patch-a' },
      { writerId: 'writer-b', patchSha: 'patch-b' },
    ]);
    expect(Object.isFrozen(coordinate)).toBe(true);
    expect(Object.isFrozen(coordinate.frontierEntries)).toBe(true);
    expect(Object.isFrozen(coordinate.frontierEntries[0])).toBe(true);

    const frontier = coordinate.frontier();
    frontier.set('writer-c', 'patch-c');
    expect(coordinate.frontier().has('writer-c')).toBe(false);
    expect(coordinate.equals(new MaterializationCoordinate({
      frontier: new Map([
        ['writer-a', 'patch-a'],
        ['writer-b', 'patch-b'],
      ]),
      ceiling: 42,
    }))).toBe(true);
  });

  it('distinguishes ceiling, frontier size, writer, and patch differences', () => {
    const coordinate = exactCoordinate();
    expect(coordinate.equals(null)).toBe(false);
    expect(coordinate.equals(undefined)).toBe(false);
    expect(coordinate.equals(new MaterializationCoordinate({
      frontier: coordinate.frontier(),
      ceiling: 8,
    }))).toBe(false);
    expect(coordinate.equals(new MaterializationCoordinate({
      frontier: new Map(),
      ceiling: 7,
    }))).toBe(false);
    expect(coordinate.equals(new MaterializationCoordinate({
      frontier: new Map([['writer-b', 'patch-a']]),
      ceiling: 7,
    }))).toBe(false);
    expect(coordinate.equals(new MaterializationCoordinate({
      frontier: new Map([['writer-a', 'patch-b']]),
      ceiling: 7,
    }))).toBe(false);
  });

  it('orders frontier writers by protocol strings instead of locale collation', () => {
    const coordinate = new MaterializationCoordinate({
      frontier: new Map([
        ['\u00e4', 'patch-a-umlaut'],
        ['z', 'patch-z'],
      ]),
      ceiling: null,
    });

    expect(coordinate.frontierEntries.map(({ writerId }) => writerId)).toEqual([
      'z',
      '\u00e4',
    ]);
  });

  it.each([
    ['options', null],
    ['frontier', { frontier: {}, ceiling: null }],
    ['writer', { frontier: new Map([['', 'patch']]), ceiling: null }],
    ['patch', { frontier: new Map([['writer', '']]), ceiling: null }],
    ['negative ceiling', { frontier: new Map(), ceiling: -1 }],
    ['fractional ceiling', { frontier: new Map(), ceiling: 1.5 }],
    ['unsafe ceiling', { frontier: new Map(), ceiling: Number.MAX_SAFE_INTEGER + 1 }],
  ])('rejects invalid %s', (_field, options) => {
    expect(() => construct(MaterializationCoordinate, options)).toThrowError(
      /Materialization coordinate/u,
    );
  });
});

describe('MaterializationRoots', () => {
  it('exposes every independent root in canonical bundle order', () => {
    const roots = materializationRoots();

    expect(roots.entries().map(([name]) => name)).toEqual([
      'adjacency',
      'edge-alive',
      'edge-births',
      'frontier',
      'node-alive',
      'properties',
      'provenance-support',
      'roaring-indexes',
    ]);
    expect(MATERIALIZATION_ROOT_NAMES).toEqual(roots.entries().map(([name]) => name));
    expect(Object.isFrozen(MATERIALIZATION_ROOT_NAMES)).toBe(true);
    expect(Object.isFrozen(roots)).toBe(true);
    expect(Object.isFrozen(roots.entries())).toBe(true);
    expect(Object.isFrozen(roots.entries()[0])).toBe(true);
  });

  it.each([
    'adjacency',
    'edgeAlive',
    'edgeBirths',
    'frontier',
    'nodeAlive',
    'properties',
    'provenanceSupport',
    'roaringIndexes',
  ])('rejects a non-bundle %s root', (field) => {
    const options = rootsOptions();
    Reflect.set(options, field, new StorageHandle('not-a-bundle'));
    expect(() => construct(MaterializationRoots, options)).toThrowError(
      /Materialization roots/u,
    );
  });

  it('rejects a missing options object', () => {
    expect(() => construct(MaterializationRoots, null)).toThrowError(/options/u);
  });
});

describe('MaterializationHandle', () => {
  it('binds an exact coordinate and independent roots to retained bundle evidence', () => {
    const bundle = bundleHandle('materialization');
    const handle = new MaterializationHandle({
      laneName: 'events',
      bundle,
      coordinate: exactCoordinate(),
      roots: materializationRoots(),
      stateHash: 'state-hash',
      retention: retentionWitness(bundle),
    });

    expect(handle.laneName).toBe('events');
    expect(handle.bundle).toBe(bundle);
    expect(handle.retention.handle.equals(bundle)).toBe(true);
    expect(Object.isFrozen(handle)).toBe(true);
  });

  it.each([
    ['laneName', ''],
    ['bundle', new StorageHandle('not-a-bundle')],
    ['coordinate', { frontier: new Map(), ceiling: null }],
    ['roots', rootsOptions()],
    ['stateHash', ''],
    ['retention', { policy: 'evictable' }],
  ])('rejects invalid %s', (field, value) => {
    const options = handleOptions();
    Reflect.set(options, field, value);
    expect(() => construct(MaterializationHandle, options)).toThrowError(
      /Materialization handle/u,
    );
  });

  it('rejects retention evidence for another bundle', () => {
    const options = handleOptions();
    Reflect.set(options, 'retention', retentionWitness(bundleHandle('other')));
    expect(() => construct(MaterializationHandle, options)).toThrowError(
      /does not retain/u,
    );
  });

  it('rejects a missing options object', () => {
    expect(() => construct(MaterializationHandle, null)).toThrowError(/options/u);
  });
});

function exactCoordinate(): MaterializationCoordinate {
  return new MaterializationCoordinate({
    frontier: new Map([['writer-a', 'patch-a']]),
    ceiling: 7,
  });
}

function bundleHandle(name: string): BundleHandle {
  return new BundleHandle(`git-cas:1:bundle:${name}`);
}

function rootsOptions(): MaterializationRootsOptions {
  return {
    adjacency: bundleHandle('adjacency'),
    edgeAlive: bundleHandle('edge-alive'),
    edgeBirths: bundleHandle('edge-births'),
    frontier: bundleHandle('frontier'),
    nodeAlive: bundleHandle('node-alive'),
    properties: bundleHandle('properties'),
    provenanceSupport: bundleHandle('provenance-support'),
    roaringIndexes: bundleHandle('roaring-indexes'),
  };
}

function materializationRoots(): MaterializationRoots {
  return new MaterializationRoots(rootsOptions());
}

function retentionWitness(handle: BundleHandle): StorageRetentionWitness {
  return new StorageRetentionWitness({
    handle,
    policy: 'evictable',
    reachability: 'anchored',
    root: new StorageRetentionRoot({
      kind: 'cache-set',
      namespace: 'git-warp/materializations',
      locator: 'refs/cas/caches/git-warp/materializations',
      generation: 'generation-1',
      path: 'root-00000000',
    }),
    observedAt: '1970-01-01T00:00:00.000Z',
  });
}

function handleOptions(): Record<string, object | string> {
  const bundle = bundleHandle('materialization');
  return {
    laneName: 'events',
    bundle,
    coordinate: exactCoordinate(),
    roots: materializationRoots(),
    stateHash: 'state-hash',
    retention: retentionWitness(bundle),
  };
}

function construct(target: Function, value: object | null): void {
  Reflect.construct(target, [value]);
}
