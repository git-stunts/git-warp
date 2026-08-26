import { describe, expect, it } from 'vitest';

import EntityAdmissionInventoryBasis from '../../../../src/domain/entity/EntityAdmissionInventoryBasis.ts';

describe('EntityAdmissionInventoryBasis', () => {
  it('orders frontier writers by locale-independent code units', () => {
    const basis = new EntityAdmissionInventoryBasis({
      frontier: new Map([
        ['a', 'patch-a'],
        ['Z', 'patch-z'],
      ]),
      worldlineName: 'captures',
    });

    expect(basis.frontierEntries.map(({ writerId }) => writerId))
      .toEqual(['Z', 'a']);
  });
});
