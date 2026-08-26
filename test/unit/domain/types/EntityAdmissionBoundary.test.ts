import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import EntityAdmissionBoundary from '../../../../src/domain/types/EntityAdmissionBoundary.ts';
import { freezeEntityAdmissionBoundaries } from '../../../../src/domain/types/EntityAdmissionBoundaryRuntime.ts';
import EntityAdmissionOrigin from '../../../../src/domain/types/EntityAdmissionOrigin.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import PropSet from '../../../../src/domain/types/ops/PropSet.ts';

describe('EntityAdmissionBoundary', () => {
  it('requires options, valid coordinates, and a runtime origin', () => {
    expectBoundaryFailure(() => new EntityAdmissionBoundary(null));
    expectBoundaryFailure(
      () =>
        new EntityAdmissionBoundary({
          operationIndex: -1,
          operationCount: 2,
          origin: EntityAdmissionOrigin.suppliedSubject(),
        })
    );
    expectBoundaryFailure(
      () =>
        new EntityAdmissionBoundary({
          operationIndex: 0,
          operationCount: 1,
          origin: EntityAdmissionOrigin.suppliedSubject(),
        })
    );
    expectBoundaryFailure(
      () =>
        new EntityAdmissionBoundary({
          operationIndex: 0,
          operationCount: 2,
          // @ts-expect-error Exercise the JavaScript boundary.
          origin: { kind: 'supplied-subject' },
        })
    );
  });
});

describe('EntityAdmissionOrigin', () => {
  it('rejects absent, unsupported, and incomplete allocation metadata', () => {
    expectOriginFailure(() => new EntityAdmissionOrigin(null));
    expectOriginFailure(
      () =>
        new EntityAdmissionOrigin({
          // @ts-expect-error Exercise the JavaScript boundary.
          kind: 'invented',
        })
    );
    expectOriginFailure(() => EntityAdmissionOrigin.allocated('', new Dot('writer', 1)));
    expectOriginFailure(
      () =>
        new EntityAdmissionOrigin({
          kind: 'allocated',
          namespace: 'capture',
          // @ts-expect-error Exercise the JavaScript boundary.
          allocationDot: { writer: 'writer', counter: 1 },
        })
    );
  });

  it('rejects allocation fields on non-allocated origins', () => {
    expectOriginFailure(
      () =>
        new EntityAdmissionOrigin({
          kind: 'supplied-subject',
          // @ts-expect-error Exercise the JavaScript boundary.
          namespace: 'capture',
        })
    );
  });
});

describe('freezeEntityAdmissionBoundaries', () => {
  it('requires a boundary array containing validated boundaries', () => {
    expectBoundaryFailure(() =>
      freezeEntityAdmissionBoundaries(
        // @ts-expect-error Exercise the JavaScript boundary.
        {},
        []
      )
    );
    expectBoundaryFailure(() =>
      freezeEntityAdmissionBoundaries(
        [
          // @ts-expect-error Exercise the JavaScript boundary.
          { operationIndex: 0, operationCount: 2 },
        ],
        []
      )
    );
  });

  it('rejects overlapping and out-of-bounds boundaries', () => {
    const operations = validOperations();
    expectBoundaryFailure(() =>
      freezeEntityAdmissionBoundaries([boundary(0, 2), boundary(1, 2)], operations)
    );
    expectBoundaryFailure(() =>
      freezeEntityAdmissionBoundaries([boundary(0, operations.length + 1)], operations)
    );
  });

  it('requires each boundary to begin with NodeAdd', () => {
    expectBoundaryFailure(() =>
      freezeEntityAdmissionBoundaries(
        [boundary(0, 2)],
        [new PropSet('capture:1', 'body', 'retained'), new PropSet('capture:1', 'kind', 'capture')]
      )
    );
  });

  it('requires complete properties for only the created subject', () => {
    expectBoundaryFailure(() =>
      freezeEntityAdmissionBoundaries(
        [boundary(0, 2)],
        [
          new NodeAdd('capture:1', new Dot('writer', 1)),
          new PropSet('capture:2', 'body', 'retained'),
        ]
      )
    );

    expectBoundaryFailure(() =>
      freezeEntityAdmissionBoundaries(
        [boundary(0, 2)],
        [
          new NodeAdd('capture:1', new Dot('writer', 1)),
          new PropSet('capture:1', 'body', new InvalidPropertyCarrier()),
        ]
      )
    );
  });

  it('rejects absent, non-property, and duplicate payload operations', () => {
    const sparse = validOperations();
    delete sparse[1];
    expectBoundaryFailure(() => freezeEntityAdmissionBoundaries([boundary(0, 3)], sparse));

    expectBoundaryFailure(() =>
      freezeEntityAdmissionBoundaries(
        [boundary(0, 2)],
        [
          new NodeAdd('capture:1', new Dot('writer', 1)),
          new NodeAdd('capture:2', new Dot('writer', 2)),
        ]
      )
    );

    expectBoundaryFailure(() =>
      freezeEntityAdmissionBoundaries(
        [boundary(0, 3)],
        [
          new NodeAdd('capture:1', new Dot('writer', 1)),
          new PropSet('capture:1', 'body', 'first'),
          new PropSet('capture:1', 'body', 'second'),
        ]
      )
    );
  });
});

function boundary(operationIndex: number, operationCount: number) {
  return new EntityAdmissionBoundary({
    operationIndex,
    operationCount,
    origin: EntityAdmissionOrigin.suppliedSubject(),
  });
}

function validOperations() {
  return [
    new NodeAdd('capture:1', new Dot('writer', 1)),
    new PropSet('capture:1', 'body', 'retained'),
    new PropSet('capture:1', 'kind', 'capture'),
  ];
}

class InvalidPropertyCarrier {}

function expectBoundaryFailure(operation: () => object | void): void {
  expect(operation).toThrowError(
    expect.objectContaining({
      code: 'E_PATCH_ENTITY_ADMISSION_BOUNDARY',
    })
  );
}

function expectOriginFailure(operation: () => object): void {
  expect(operation).toThrowError(
    expect.objectContaining({
      code: 'E_PATCH_ENTITY_ADMISSION_ORIGIN',
    })
  );
}
