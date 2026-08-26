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
});
