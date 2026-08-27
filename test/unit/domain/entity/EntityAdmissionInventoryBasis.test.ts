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

  it('rejects a forged frontier without invoking its entries method', () => {
    let entriesCalled = false;
    const forgedFrontier = {
      entries(): IterableIterator<never> {
        entriesCalled = true;
        return [][Symbol.iterator]();
      },
    };

    expect(
      () =>
        new EntityAdmissionInventoryBasis({
          // @ts-expect-error Exercise the JavaScript boundary with a forged Map shape.
          frontier: forgedFrontier,
          worldlineName: 'captures',
        }),
    ).toThrowError(
      expect.objectContaining({
        code: 'E_ENTITY_ADMISSION_INVENTORY_BASIS',
      }),
    );
    expect(entriesCalled).toBe(false);
  });

  it('rejects a Map subclass without invoking its overridden entries method', () => {
    let entriesCalled = false;
    class OverriddenFrontier extends Map<string, string> {
      override entries(): MapIterator<[string, string]> {
        entriesCalled = true;
        return super.entries();
      }
    }

    expect(
      () =>
        new EntityAdmissionInventoryBasis({
          frontier: new OverriddenFrontier([['writer-a', 'patch-a']]),
          worldlineName: 'captures',
        }),
    ).toThrowError(
      expect.objectContaining({
        code: 'E_ENTITY_ADMISSION_INVENTORY_BASIS',
      }),
    );
    expect(entriesCalled).toBe(false);
  });

  it('rejects an own entries override on an otherwise native Map', () => {
    let entriesCalled = false;
    const frontier = new Map([['writer-a', 'patch-a']]);
    Object.defineProperty(frontier, 'entries', {
      value: () => {
        entriesCalled = true;
        return [][Symbol.iterator]();
      },
    });

    expect(
      () =>
        new EntityAdmissionInventoryBasis({
          frontier,
          worldlineName: 'captures',
        }),
    ).toThrowError(
      expect.objectContaining({
        code: 'E_ENTITY_ADMISSION_INVENTORY_BASIS',
      }),
    );
    expect(entriesCalled).toBe(false);
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
