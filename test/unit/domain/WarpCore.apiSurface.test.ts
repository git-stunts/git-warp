import { describe, expect, it } from 'vitest';
import InMemoryGraphAdapter from '../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import WarpCore from '../../../src/domain/WarpCore.ts';

describe('WarpCore API surface', () => {
  it('keeps the core opener on the class surface', () => {
    const staticNames = Object.getOwnPropertyNames(WarpCore)
      .filter((name) => !['length', 'name', 'prototype'].includes(name))
      .sort();

    expect(staticNames).toEqual(['_adopt', 'open']);
  });

  it('keeps adopted runtime methods available on opened cores', async () => {
    const core = await WarpCore.open({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'api-surface',
      writerId: 'writer-1',
    });

    expect(core).toBeInstanceOf(WarpCore);
    expect(typeof core.createPatch).toBe('function');
    expect(typeof core.patch).toBe('function');
    expect(typeof core.materialize).toBe('function');
    expect(typeof core.syncWith).toBe('function');
    expect(typeof core.fork).toBe('function');
  });

  it('keeps effect accessors on the prototype surface', () => {
    const effectPipeline = Object.getOwnPropertyDescriptor(WarpCore.prototype, 'effectPipeline');
    const effectEmissions = Object.getOwnPropertyDescriptor(WarpCore.prototype, 'effectEmissions');
    const deliveryObservations = Object.getOwnPropertyDescriptor(
      WarpCore.prototype,
      'deliveryObservations'
    );
    const externalizationPolicy = Object.getOwnPropertyDescriptor(
      WarpCore.prototype,
      'externalizationPolicy'
    );

    expect(typeof effectPipeline?.get).toBe('function');
    expect(typeof effectPipeline?.set).toBe('function');
    expect(typeof effectEmissions?.get).toBe('function');
    expect(typeof deliveryObservations?.get).toBe('function');
    expect(typeof externalizationPolicy?.get).toBe('function');
    expect(typeof externalizationPolicy?.set).toBe('function');
  });
});
