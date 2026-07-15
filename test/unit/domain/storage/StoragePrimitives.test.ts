import { describe, expect, it } from 'vitest';
import AssetHandle from '../../../../src/domain/storage/AssetHandle.ts';
import BundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import StorageHandle from '../../../../src/domain/storage/StorageHandle.ts';
import StorageRetentionWitness, {
  StorageRetentionRoot,
} from '../../../../src/domain/storage/StorageRetentionWitness.ts';

type WitnessOptions = ConstructorParameters<typeof StorageRetentionWitness>[0];

describe('storage handles', () => {
  it('preserves opaque identity across storage handle specializations', () => {
    const generic = new StorageHandle('git-cas:1:asset:test');
    const asset = new AssetHandle('git-cas:1:asset:test');
    const bundle = new BundleHandle('git-cas:1:bundle:test');

    expect(generic.toString()).toBe('git-cas:1:asset:test');
    expect(generic.equals(asset)).toBe(true);
    expect(generic.equals(bundle)).toBe(false);
    expect(generic.equals(null)).toBe(false);
    expect(generic.equals(undefined)).toBe(false);
    expect(Object.isFrozen(generic)).toBe(true);
  });

  it.each([
    '',
    'line\nbreak',
    'carriage\rreturn',
    'nul\0byte',
    'x'.repeat(4097),
  ])('rejects malformed handle token %j', (token) => {
    expect(() => new StorageHandle(token)).toThrowError(/StorageHandle/u);
  });

  it('rejects non-string handle tokens at runtime', () => {
    expect(() => construct(StorageHandle, 42)).toThrowError(/StorageHandle/u);
  });
});

describe('storage retention evidence', () => {
  it('retains validated runtime-backed handle and root identities', () => {
    const root = validRoot();
    const witness = new StorageRetentionWitness(validWitnessOptions(root));

    expect(witness.handle.toString()).toBe('git-cas:1:bundle:test');
    expect(witness.policy).toBe('pinned');
    expect(witness.reachability).toBe('anchored');
    expect(witness.root).toBe(root);
    expect(witness.observedAt).toBe('1970-01-01T00:00:00.000Z');
    expect(Object.isFrozen(root)).toBe(true);
    expect(Object.isFrozen(witness)).toBe(true);
  });

  it.each([
    ['root.kind', { ...validRootOptions(), kind: 'forever' }],
    ['root.namespace', { ...validRootOptions(), namespace: '' }],
    ['root.locator', { ...validRootOptions(), locator: '' }],
    ['root.generation', { ...validRootOptions(), generation: '' }],
    ['root.path', { ...validRootOptions(), path: '' }],
  ])('rejects invalid %s', (_field, options) => {
    expect(() => construct(StorageRetentionRoot, options)).toThrowError(
      /Storage retention witness/u,
    );
  });

  it.each([
    ['handle', { ...validWitnessOptions(), handle: 'raw-string' }],
    ['policy', { ...validWitnessOptions(), policy: 'forever' }],
    ['reachability', { ...validWitnessOptions(), reachability: 'unknown' }],
    ['root', { ...validWitnessOptions(), root: validRootOptions() }],
    ['observedAt', { ...validWitnessOptions(), observedAt: 'yesterday' }],
    ['observedAt range', { ...validWitnessOptions(), observedAt: '1970-19-41T28:70:70.000Z' }],
  ])('rejects invalid witness %s', (_field, options) => {
    expect(() => construct(StorageRetentionWitness, options)).toThrowError(
      /Storage retention witness/u,
    );
  });

  it('rejects missing constructor option objects', () => {
    expect(() => construct(StorageRetentionRoot, null)).toThrowError(/options/u);
    expect(() => construct(StorageRetentionWitness, null)).toThrowError(/options/u);
  });
});

function validRootOptions(): ConstructorParameters<typeof StorageRetentionRoot>[0] {
  return {
    kind: 'publication',
    namespace: 'test',
    locator: 'refs/warp/test/publications',
    generation: 'generation-1',
    path: '/',
  };
}

function validRoot(): StorageRetentionRoot {
  return new StorageRetentionRoot(validRootOptions());
}

function validWitnessOptions(root = validRoot()): WitnessOptions {
  return {
    handle: new BundleHandle('git-cas:1:bundle:test'),
    policy: 'pinned',
    reachability: 'anchored',
    root,
    observedAt: '1970-01-01T00:00:00.000Z',
  };
}

function construct(target: Function, value: object | string | number | null): void {
  Reflect.construct(target, [value]);
}
