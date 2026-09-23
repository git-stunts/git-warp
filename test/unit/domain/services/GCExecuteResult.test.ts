/**
 * GCExecuteResult is a value object: every field is stated by its producer.
 *
 * `propertiesPruned` was briefly optional with a `?? 0` default, which let a
 * construction site report "zero registers pruned" without ever considering
 * the question. A count nobody chose is indistinguishable from a count that
 * was measured, so the constructor requires it.
 */

import { describe, it, expect } from 'vitest';
import GCExecuteResult from '../../../../src/domain/services/GCExecuteResult.ts';

describe('GCExecuteResult', () => {
  it('requires every count, including propertiesPruned', () => {
    // @ts-expect-error — omitting propertiesPruned must not type-check.
    const omitted = new GCExecuteResult({
      nodesCompacted: 1,
      edgesCompacted: 2,
      tombstonesRemoved: 3,
    });
    // A silent default would make this 0; a required field makes it undefined,
    // which is what the compiler error above is protecting against.
    expect(omitted.propertiesPruned).toBeUndefined();
  });

  it('carries the counts its producer states', () => {
    const result = new GCExecuteResult({
      nodesCompacted: 1,
      edgesCompacted: 2,
      tombstonesRemoved: 3,
      propertiesPruned: 4,
    });

    expect(result.nodesCompacted).toBe(1);
    expect(result.edgesCompacted).toBe(2);
    expect(result.tombstonesRemoved).toBe(3);
    expect(result.propertiesPruned).toBe(4);
    expect(Object.isFrozen(result)).toBe(true);
  });
});
