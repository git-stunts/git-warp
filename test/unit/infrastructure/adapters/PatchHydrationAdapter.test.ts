import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import { hydratePatchAtDecodeBoundary } from '../../../../src/infrastructure/adapters/PatchHydrationAdapter.ts';

describe('PatchHydrationAdapter', () => {
  it('validates raw entity admission metadata into typed boundaries', () => {
    const patch = hydratePatchAtDecodeBoundary({
      writer: 'alice',
      lamport: 1,
      ops: [
        { type: 'NodeAdd', node: 'capture:1', dot: ['alice', 1] },
        { type: 'NodePropSet', node: 'capture:1', key: 'body', value: 'retained' },
      ],
      entityAdmissions: [
        {
          operationIndex: 0,
          operationCount: 2,
          origin: {
            kind: 'allocated',
            namespace: 'capture',
            allocationDot: ['alice', 1],
          },
        },
      ],
    });

    expect(patch.entityAdmissions).toHaveLength(1);
    expect(patch.entityAdmissions?.[0]?.origin).toMatchObject({
      kind: 'allocated',
      namespace: 'capture',
      allocationDot: new Dot('alice', 1),
    });
  });

  it('rejects explicit null entity admission metadata', () => {
    expect(() =>
      hydratePatchAtDecodeBoundary({
        writer: 'alice',
        lamport: 1,
        ops: [],
        entityAdmissions: null,
      })
    ).toThrow("Decoded patch field 'entityAdmissions' must be an array");
  });

  it('rejects allocation fields on a supplied-subject origin', () => {
    expect(() =>
      hydratePatchAtDecodeBoundary({
        writer: 'alice',
        lamport: 1,
        ops: [
          { type: 'NodeAdd', node: 'capture:1', dot: ['alice', 1] },
          { type: 'NodePropSet', node: 'capture:1', key: 'body', value: 'retained' },
        ],
        entityAdmissions: [
          {
            operationIndex: 0,
            operationCount: 2,
            origin: {
              kind: 'supplied-subject',
              namespace: 'capture',
            },
          },
        ],
      })
    ).toThrow('entityAdmissions[0].origin.namespace belongs only to allocated admissions');
  });

  it.each([
    {
      label: 'canonical record fields',
      allocationDot: { writerId: 'alice', counter: 1 },
    },
    {
      label: 'legacy record aliases',
      allocationDot: { writer: 'alice', seq: 1 },
    },
  ])('accepts allocated Dot $label', ({ allocationDot }) => {
    const patch = hydratePatchAtDecodeBoundary(
      patchWithOrigin({
        kind: 'allocated',
        namespace: 'capture',
        allocationDot,
      })
    );

    expect(patch.entityAdmissions?.[0]?.origin.allocationDot).toEqual(new Dot('alice', 1));
  });

  it('accepts legacy-unrecorded origins without allocation metadata', () => {
    const patch = hydratePatchAtDecodeBoundary(
      patchWithOrigin({
        kind: 'legacy-unrecorded',
      })
    );

    expect(patch.entityAdmissions?.[0]?.origin).toMatchObject({
      kind: 'legacy-unrecorded',
      namespace: null,
      allocationDot: null,
    });
  });

  it.each([
    {
      label: 'unsupported origin kind',
      origin: { kind: 'invented' },
      message: 'entityAdmissions[0].origin.kind is unsupported',
    },
    {
      label: 'stray allocation Dot',
      origin: { kind: 'supplied-subject', allocationDot: ['alice', 1] },
      message: 'entityAdmissions[0].origin.allocationDot belongs only to allocated admissions',
    },
    {
      label: 'malformed Dot tuple',
      origin: { kind: 'allocated', namespace: 'capture', allocationDot: ['alice'] },
      message: 'entityAdmissions[0].origin.allocationDot dot tuple must be [writerId, counter]',
    },
    {
      label: 'Dot without a writer',
      origin: { kind: 'allocated', namespace: 'capture', allocationDot: { counter: 1 } },
      message: 'entityAdmissions[0].origin.allocationDot dot requires writerId/writer',
    },
    {
      label: 'Dot without a counter',
      origin: { kind: 'allocated', namespace: 'capture', allocationDot: { writerId: 'alice' } },
      message: 'entityAdmissions[0].origin.allocationDot dot requires integer counter/seq',
    },
    {
      label: 'non-string namespace',
      origin: { kind: 'allocated', namespace: 7, allocationDot: ['alice', 1] },
      message: "Decoded patch requires string 'entityAdmissions[0].origin.namespace'",
    },
  ])('rejects $label', ({ origin, message }) => {
    expect(() => hydratePatchAtDecodeBoundary(patchWithOrigin(origin))).toThrow(message);
  });

  it('rejects malformed admission entries and operation coordinates', () => {
    expect(() =>
      hydratePatchAtDecodeBoundary({
        writer: 'alice',
        lamport: 1,
        ops: [],
        entityAdmissions: [null],
      })
    ).toThrow('Decoded patch entityAdmissions[0] must be an object');

    expect(() =>
      hydratePatchAtDecodeBoundary(patchWithOrigin({ kind: 'supplied-subject' }, 0.5))
    ).toThrow("Decoded patch requires integer 'entityAdmissions[0].operationIndex'");
  });

  it('still delegates non-object roots to ordinary patch validation', () => {
    expect(() => hydratePatchAtDecodeBoundary('not-a-patch')).toThrow(
      'Decoded patch root must be an object'
    );
  });
});

function patchWithOrigin(origin: object, operationIndex = 0, operationCount = 2) {
  return {
    writer: 'alice',
    lamport: 1,
    ops: [
      { type: 'NodeAdd', node: 'capture:1', dot: ['alice', 1] },
      { type: 'NodePropSet', node: 'capture:1', key: 'body', value: 'retained' },
    ],
    entityAdmissions: [{ operationIndex, operationCount, origin }],
  };
}
