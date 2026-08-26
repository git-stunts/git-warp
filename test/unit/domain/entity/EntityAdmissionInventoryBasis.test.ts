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

    expect(basis.frontierEntries.map(({ writerId }) => writerId)).toEqual(['Z', 'a']);
  });

  it('requires options and non-empty worldline identity', () => {
    expect(() => new EntityAdmissionInventoryBasis(null)).toThrowError(
      expect.objectContaining({ code: 'E_ENTITY_ADMISSION_INVENTORY_BASIS' })
    );
    expect(
      () =>
        new EntityAdmissionInventoryBasis({
          frontier: new Map(),
          worldlineName: '',
        })
    ).toThrowError(
      expect.objectContaining({
        code: 'E_ENTITY_ADMISSION_INVENTORY_BASIS',
      })
    );
  });

  it.each([
    { writerId: '', patchSha: 'patch-a' },
    { writerId: 'writer-a', patchSha: '' },
  ])('rejects an incomplete frontier entry %#', ({ writerId, patchSha }) => {
    expect(
      () =>
        new EntityAdmissionInventoryBasis({
          frontier: new Map([[writerId, patchSha]]),
          worldlineName: 'captures',
        })
    ).toThrowError(
      expect.objectContaining({
        code: 'E_ENTITY_ADMISSION_INVENTORY_BASIS',
      })
    );
  });
});
