import { describe, expect, it } from 'vitest';

import Intent from '../../../../src/domain/api/Intent.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import RetainedEntityAdmission from '../../../../src/domain/entity/RetainedEntityAdmission.ts';
import EntityAdmissionOrigin from '../../../../src/domain/types/EntityAdmissionOrigin.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';

const CONTEXT = VersionVector.empty();
const DOT = new Dot('writer', 1);
const EVENT = new EventId(1, 'writer', 'abcd1234', 0);
const ORIGIN = EntityAdmissionOrigin.suppliedSubject();
const INTENT = Intent.addEntity({
  subject: 'capture:1',
  properties: { body: 'retained' },
});

describe('RetainedEntityAdmission', () => {
  it('requires constructor options and causal coordinates', () => {
    expectRetainedFailure(() => new RetainedEntityAdmission(null));
    expectRetainedFailure(
      () =>
        new RetainedEntityAdmission({
          context: CONTEXT,
          // @ts-expect-error Exercise the JavaScript boundary.
          dot: {},
          eventId: EVENT,
          intent: INTENT,
          origin: ORIGIN,
          subject: 'capture:1',
        })
    );
    expectRetainedFailure(
      () =>
        new RetainedEntityAdmission({
          context: CONTEXT,
          dot: DOT,
          // @ts-expect-error Exercise the JavaScript boundary.
          eventId: {},
          intent: INTENT,
          origin: ORIGIN,
          subject: 'capture:1',
        })
    );
  });

  it('requires a validated origin and entity intent for the same subject', () => {
    expectRetainedFailure(
      () =>
        new RetainedEntityAdmission({
          context: CONTEXT,
          dot: DOT,
          eventId: EVENT,
          intent: INTENT,
          // @ts-expect-error Exercise the JavaScript boundary.
          origin: {},
          subject: 'capture:1',
        })
    );
    expectRetainedFailure(
      () =>
        new RetainedEntityAdmission({
          context: CONTEXT,
          dot: DOT,
          eventId: EVENT,
          intent: Intent.addNode({ subject: 'capture:1' }),
          origin: ORIGIN,
          subject: 'capture:1',
        })
    );
    expectRetainedFailure(
      () =>
        new RetainedEntityAdmission({
          context: CONTEXT,
          dot: DOT,
          eventId: EVENT,
          intent: INTENT,
          origin: ORIGIN,
          subject: 'capture:other',
        })
    );
  });

  it('compares only with another retained admission', () => {
    const retained = validRetainedAdmission();
    expectRetainedFailure(() =>
      retained.compare(
        // @ts-expect-error Exercise the JavaScript boundary.
        {}
      )
    );
    expect(retained.compare(validRetainedAdmission())).toBe(0);
  });

  it('freezes an isolated causal-context snapshot', () => {
    const source = VersionVector.empty();
    source.set('observed', 1);
    const retained = validRetainedAdmission(source);

    source.set('observed', 2);

    expect(retained.context.get('observed')).toBe(1);
    expect(Object.isFrozen(retained.context)).toBe(true);
    expect(() => retained.context.set('observed', 9)).toThrowError(
      expect.objectContaining({ code: 'E_CRDT_FROZEN_MUTATION' }),
    );
    expect(retained.context.get('observed')).toBe(1);
  });
});

function validRetainedAdmission(
  context: VersionVector = CONTEXT,
): RetainedEntityAdmission {
  return new RetainedEntityAdmission({
    context,
    dot: DOT,
    eventId: EVENT,
    intent: INTENT,
    origin: ORIGIN,
    subject: 'capture:1',
  });
}

function expectRetainedFailure(operation: () => object | number): void {
  expect(operation).toThrowError(
    expect.objectContaining({
      code: 'E_ENTITY_ADMISSION_RETAINED',
    })
  );
}
