import { describe, expect, it } from 'vitest';
import { makeFixture } from '../../helpers/fixtureDsl.ts';

describe('fixtureDsl explicit setup', () => {
  it('rejects edges whose endpoints are not declared fixture nodes', () => {
    expect(() => makeFixture({
      nodes: ['A'],
      edges: [{ from: 'A', to: 'missing' }],
    })).toThrow(/Edge to 'missing'.*not in fixture\.nodes/);

    expect(() => makeFixture({
      nodes: ['B'],
      edges: [{ from: 'missing', to: 'B' }],
    })).toThrow(/Edge from 'missing'.*not in fixture\.nodes/);
  });
});
