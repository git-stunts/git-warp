import { describe, expect, it } from 'vitest';
import MaterializationCoordinate from '../../../../src/domain/materialization/MaterializationCoordinate.ts';
import MaterializationHandle from '../../../../src/domain/materialization/MaterializationHandle.ts';
import LiveMaterializationResolution from '../../../../src/domain/materialization/LiveMaterializationResolution.ts';
import MaterializationRoot from '../../../../src/domain/materialization/MaterializationRoot.ts';
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

  it('compares every root posture and retained handle', () => {
    const roots = materializationRoots();
    const changedOptions = {
      ...rootsOptions(),
      properties: retainedRoot('other-properties'),
    };

    expect(roots.equals(materializationRoots())).toBe(true);
    expect(roots.equals(new MaterializationRoots(changedOptions))).toBe(false);
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
  ])('rejects a non-materialization %s root', (field) => {
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

describe('MaterializationRoot', () => {
  it('distinguishes retained, empty, and unavailable root posture', () => {
    const handle = bundleHandle('retained');
    const retained = MaterializationRoot.retained(handle);
    const empty = MaterializationRoot.empty();
    const unavailable = MaterializationRoot.unavailable();

    expect(retained).toMatchObject({ status: 'retained', handle });
    expect(empty).toMatchObject({ status: 'empty', handle: null });
    expect(unavailable).toMatchObject({ status: 'unavailable', handle: null });
    expect(Object.isFrozen(retained)).toBe(true);
    expect(Object.isFrozen(empty)).toBe(true);
    expect(Object.isFrozen(unavailable)).toBe(true);
  });

  it('rejects a retained root without bundle identity', () => {
    expect(() => Reflect.apply(
      MaterializationRoot.retained,
      MaterializationRoot,
      [new StorageHandle('not-a-bundle')],
    )).toThrowError(/Materialization root/u);
  });

  it('compares posture and retained handle identity', () => {
    expect(retainedRoot('same').equals(retainedRoot('same'))).toBe(true);
    expect(retainedRoot('same').equals(retainedRoot('different'))).toBe(false);
    expect(MaterializationRoot.empty().equals(MaterializationRoot.empty())).toBe(true);
    expect(MaterializationRoot.empty().equals(MaterializationRoot.unavailable())).toBe(false);
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

describe('LiveMaterializationResolution', () => {
  it('freezes a valid retained resolution and delegates release', async () => {
    let releaseCalls = 0;
    const materialization = materializationHandle();
    const resolution = new LiveMaterializationResolution({
      materialization,
      source: 'retained',
      replayedPatchCount: 0,
      release: () => {
        releaseCalls += 1;
        return Promise.resolve();
      },
    });

    expect(resolution).toMatchObject({
      materialization,
      source: 'retained',
      replayedPatchCount: 0,
    });
    expect(Object.isFrozen(resolution)).toBe(true);
    await resolution.release();
    expect(releaseCalls).toBe(1);
  });

  it.each([
    ['empty materialization', { source: 'empty' }],
    ['missing retained materialization', { materialization: null }],
    ['retained replay count', { replayedPatchCount: 1 }],
    ['invalid source', { source: 'other' }],
    ['negative replay count', { replayedPatchCount: -1 }],
    ['missing release', { release: null }],
  ])('rejects an invalid %s combination', (_case, replacement) => {
    const options = resolutionOptions();
    for (const [field, value] of Object.entries(replacement)) {
      Reflect.set(options, field, value);
    }
    expect(() => construct(LiveMaterializationResolution, options)).toThrowError(
      /Live materialization resolution/u,
    );
  });

  it('rejects a missing options object', () => {
    expect(() => construct(LiveMaterializationResolution, null)).toThrowError(/options/u);
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
    adjacency: retainedRoot('adjacency'),
    edgeAlive: retainedRoot('edge-alive'),
    edgeBirths: retainedRoot('edge-births'),
    frontier: retainedRoot('frontier'),
    nodeAlive: retainedRoot('node-alive'),
    properties: retainedRoot('properties'),
    provenanceSupport: retainedRoot('provenance-support'),
    roaringIndexes: retainedRoot('roaring-indexes'),
  };
}

function retainedRoot(name: string): MaterializationRoot {
  return MaterializationRoot.retained(bundleHandle(name));
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

function materializationHandle(): MaterializationHandle {
  const bundle = bundleHandle('materialization-resolution');
  return new MaterializationHandle({
    laneName: 'events',
    bundle,
    coordinate: exactCoordinate(),
    roots: materializationRoots(),
    stateHash: 'state-hash',
    retention: retentionWitness(bundle),
  });
}

function resolutionOptions(): Record<string, object | string | number | (() => Promise<void>)> {
  return {
    materialization: materializationHandle(),
    source: 'retained',
    replayedPatchCount: 0,
    release: () => Promise.resolve(),
  };
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
