import { describe, it, expect } from 'vitest';
import WarpGraph from '../../../src/domain/WarpGraph.js';

/**
 * API Surface Snapshot Lock
 *
 * This test captures the public API of WarpGraph.prototype and fails
 * if any method is added, removed, or renamed. It prevents accidental
 * API breakage during the decomposition of WarpGraph into method files.
 *
 * Update the snapshot ONLY when an intentional API change is made.
 */
describe('WarpGraph API surface', () => {
  it('prototype methods match snapshot', () => {
    const proto = WarpGraph.prototype;
    const descriptors = Object.getOwnPropertyDescriptors(proto);
    const names = Object.keys(descriptors)
      .filter(n => n !== 'constructor')
      .sort();

    expect(names).toMatchSnapshot();
  });

  it('prototype method count matches snapshot', () => {
    const proto = WarpGraph.prototype;
    const descriptors = Object.getOwnPropertyDescriptors(proto);
    const names = Object.keys(descriptors).filter(n => n !== 'constructor');

    expect(names.length).toMatchSnapshot();
  });

  it('static methods match snapshot', () => {
    const staticNames = Object.getOwnPropertyNames(WarpGraph)
      .filter(n => !['length', 'name', 'prototype'].includes(n))
      .sort();

    expect(staticNames).toMatchSnapshot();
  });

  it('all prototype methods have correct property descriptors', () => {
    const proto = WarpGraph.prototype;
    const descriptors = Object.getOwnPropertyDescriptors(proto);

    const summary = {};
    for (const [name, desc] of Object.entries(descriptors)) {
      if (name === 'constructor') continue;

      const isGetter = typeof desc.get === 'function';
      const isSetter = typeof desc.set === 'function';

      summary[name] = {
        type: isGetter ? 'getter' : (isSetter ? 'setter' : 'method'),
        enumerable: desc.enumerable,
        configurable: desc.configurable,
      };
    }

    expect(summary).toMatchSnapshot();
  });
});
