import { describe, it, expect } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';
import { wireWarpMethods } from '../../../src/domain/warp/_wire.js';

/**
 * Prototype Wiring Invariant Lock
 *
 * Ensures that the wireWarpMethods helper works correctly and that
 * all extracted methods are properly bound to WarpGraph instances.
 * Run after every extraction phase.
 */
describe('wireWarpMethods', () => {
  it('assigns methods to prototype', () => {
    class Stub {}
    const mod = {
      foo() { return 'bar'; },
      baz() { return 42; },
    };

    wireWarpMethods(Stub, [mod]);

    const instance = new Stub();
    expect(typeof instance.foo).toBe('function');
    expect(typeof instance.baz).toBe('function');
    expect(instance.foo()).toBe('bar');
    expect(instance.baz()).toBe(42);
  });

  it('binds this to the instance', () => {
    class Stub {
      constructor() { this._name = 'hello'; }
    }
    const mod = {
      getName() { return this._name; },
    };

    wireWarpMethods(Stub, [mod]);

    const instance = new Stub();
    expect(instance.getName()).toBe('hello');
  });

  it('detects duplicate method names across modules', () => {
    class Stub {}
    const modA = { foo() {} };
    const modB = { foo() {} };

    expect(() => wireWarpMethods(Stub, [modA, modB])).toThrow(
      /duplicate method "foo"/
    );
  });

  it('ignores non-function exports', () => {
    class Stub {}
    const mod = {
      SOME_CONST: 42,
      someMethod() { return true; },
    };

    wireWarpMethods(Stub, [mod]);

    const instance = new Stub();
    expect(typeof instance.someMethod).toBe('function');
    expect(instance.SOME_CONST).toBeUndefined();
  });

  it('sets methods as non-enumerable', () => {
    class Stub {}
    const mod = { myMethod() {} };

    wireWarpMethods(Stub, [mod]);

    const desc = Object.getOwnPropertyDescriptor(Stub.prototype, 'myMethod');
    expect(desc.enumerable).toBe(false);
    expect(desc.writable).toBe(true);
    expect(desc.configurable).toBe(true);
  });
});

describe('WarpGraph prototype completeness', () => {
  it('has all core methods on prototype', () => {
    const proto = WarpGraph.prototype;
    // Spot-check critical methods exist and are functions/getters
    const expectedMethods = [
      'createPatch', 'patch', 'materialize', 'materializeAt',
      'hasNode', 'getNodeProps', 'getEdgeProps', 'neighbors',
      'getNodes', 'getEdges', 'getPropertyCount', 'getStateSnapshot',
      'subscribe', 'watch',
      'patchesFor', 'materializeSlice', 'loadPatchBySha',
      'fork', 'createWormhole',
      'syncWith', 'serve', 'createSyncRequest', 'processSyncRequest',
      'applySyncResponse', 'syncNeeded',
      'createCheckpoint', 'maybeRunGC', 'runGC', 'getGCMetrics',
      'getFrontier', 'hasFrontierChanged', 'status',
      'writer', 'createWriter',
      'query', 'observer', 'translationCost',
      'discoverWriters', 'discoverTicks',
      'join', 'syncCoverage',
      'setSeekCache',
    ];

    for (const name of expectedMethods) {
      const desc = Object.getOwnPropertyDescriptor(proto, name);
      expect(desc, `missing method: ${name}`).toBeDefined();
      expect(typeof desc.value, `${name} should be a function`).toBe('function');
    }
  });

  it('has all core getters on prototype', () => {
    const proto = WarpGraph.prototype;
    const expectedGetters = [
      'graphName', 'writerId', 'persistence', 'onDeleteWithData',
      'seekCache', 'gcPolicy', 'temporal', 'provenanceIndex',
    ];

    for (const name of expectedGetters) {
      const desc = Object.getOwnPropertyDescriptor(proto, name);
      expect(desc, `missing getter: ${name}`).toBeDefined();
      expect(typeof desc.get, `${name} should be a getter`).toBe('function');
    }
  });

  it('has static open method', () => {
    expect(typeof WarpGraph.open).toBe('function');
  });
});
