import { describe, expect, it } from 'vitest';

import AdmissionEvaluation from '../../../src/domain/admission/AdmissionEvaluation.ts';
import ConflictAdmission from '../../../src/domain/admission/ConflictAdmission.ts';
import ConflictWitness from '../../../src/domain/admission/ConflictWitness.ts';
import DraftTimeline from '../../../src/domain/api/DraftTimeline.ts';
import { projectAdmissionOutcome } from '../../../src/domain/api/AdmissionOutcomeRuntime.ts';
import EntityOccurrence from '../../../src/domain/api/EntityOccurrence.ts';
import {
  createEntityOccurrence,
  requireIssuedEntityOccurrence,
} from '../../../src/domain/api/EntityOccurrenceRuntime.ts';
import { intent } from '../../../src/domain/api/IntentBuilders.ts';
import { freezeEvidence } from '../../../src/domain/api/EvidenceRuntime.ts';
import JoinReceipt from '../../../src/domain/api/JoinReceipt.ts';
import { READ_JOIN_RECEIPT_OUTCOMES } from '../../../src/domain/api/ReceiptOutcome.ts';
import WriteReceipt from '../../../src/domain/api/WriteReceipt.ts';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import { EventId } from '../../../src/domain/utils/EventId.ts';
import {
  testDerivedIntentAdmissionReceipt,
  testObstructedIntentAdmissionReceipt,
} from '../../helpers/intentAdmission.ts';

const EVIDENCE = freezeEvidence(
  {
    basis: { id: 'evidence:basis' },
    support: [],
  },
  'test.evidence'
);

describe('receipt outcomes', () => {
  it('quarantines the transitional read/join outcome axis to five values', () => {
    expect([...READ_JOIN_RECEIPT_OUTCOMES]).toEqual([
      'accepted',
      'obstructed',
      'conflicted',
      'underdetermined',
      'rejected',
    ]);
  });

  it('keeps transitional join outcomes independent from write admission', () => {
    const draft = new DraftTimeline({
      name: 'try-admin-role',
      timeline: 'events',
      writer: 'agent-1',
    });

    for (const outcome of READ_JOIN_RECEIPT_OUTCOMES) {
      const receipt =
        outcome === 'accepted'
          ? new JoinReceipt({
              timeline: 'events',
              writer: 'agent-1',
              draft,
              mode: 'join',
              outcome,
              evidence: EVIDENCE,
            })
          : new JoinReceipt({
              timeline: 'events',
              writer: 'agent-1',
              draft,
              mode: 'join',
              outcome,
              reason: `join_${outcome}`,
            });

      expect(receipt.outcome).toBe(outcome);
      expect(receipt.operation).toBe('join');
    }
  });

  it('rejects impossible join receipt settlements from JavaScript callers', () => {
    const draft = new DraftTimeline({
      name: 'try-admin-role',
      timeline: 'events',
      writer: 'agent-1',
    });

    expect(
      () =>
        new JoinReceipt({
          timeline: 'events',
          writer: 'agent-1',
          draft,
          mode: 'join',
          outcome: 'accepted',
          evidence: EVIDENCE,
          // @ts-expect-error runtime validation accepts JavaScript callers.
          reason: 'accepted_with_reason',
        })
    ).toThrow('Accepted JoinReceipt cannot carry a reason');
    expect(
      () =>
        new JoinReceipt({
          timeline: 'events',
          writer: 'agent-1',
          draft,
          mode: 'join',
          outcome: 'rejected',
          // @ts-expect-error runtime validation accepts JavaScript callers.
          reason: undefined,
        })
    ).toThrow('joinReceipt.reason must be a non-empty string');
  });

  it('represents obstructed writes with typed witnesses and honest recovery evidence', () => {
    const outcome = projectAdmissionOutcome(
      testObstructedIntentAdmissionReceipt('manual-write', 'git-warp.test.policy-rejected').outcome,
      EVIDENCE.basis
    );
    const receipt = new WriteReceipt({
      lane: 'events',
      writer: 'agent-1',
      intent: intent.node.add({ subject: 'user:alice' }),
      outcome,
      evidence: EVIDENCE,
    });

    expect(receipt.operation).toBe('write');
    expect(receipt.outcome).toBe(outcome);
    expect(receipt.outcome.kind).toBe('obstruction');
    expect(receipt.reason).toBe('git-warp.test.policy-rejected');
    expect(receipt.evidence).toEqual(EVIDENCE);
  });

  it('requires every admitted entity receipt to carry an occurrence', () => {
    const outcome = projectAdmissionOutcome(
      testDerivedIntentAdmissionReceipt('manual-entity').outcome,
      EVIDENCE.basis
    );

    expect(
      () =>
        new WriteReceipt({
          lane: 'events',
          writer: 'agent-1',
          intent: intent.entity.add({ subject: 'entry:1', properties: { kind: 'capture' } }),
          outcome,
          evidence: EVIDENCE,
        })
    ).toThrowError(expect.objectContaining({ code: 'E_WRITE_RECEIPT_ENTITY_OCCURRENCE' }));
  });

  it('forbids occurrences on entity conflict receipts without requiring one', () => {
    const outcome = conflictOutcome();
    const fields = {
      lane: 'events',
      writer: 'agent-1',
      intent: intent.entity.add({ subject: 'entry:1', properties: { kind: 'capture' } }),
      outcome,
      evidence: EVIDENCE,
    };

    expect(new WriteReceipt(fields).occurrence).toBeUndefined();
    expect(() => new WriteReceipt({ ...fields, occurrence: entityOccurrence() })).toThrowError(
      expect.objectContaining({ code: 'E_WRITE_RECEIPT_ENTITY_OCCURRENCE' })
    );
  });

  it('rejects occurrences on non-entity and obstructed receipts', () => {
    const occurrence = entityOccurrence();
    const admitted = projectAdmissionOutcome(
      testDerivedIntentAdmissionReceipt('manual-node').outcome,
      EVIDENCE.basis
    );
    const obstructed = projectAdmissionOutcome(
      testObstructedIntentAdmissionReceipt('manual-entity-obstruction').outcome,
      EVIDENCE.basis
    );

    expect(
      () =>
        new WriteReceipt({
          lane: 'events',
          writer: 'agent-1',
          intent: intent.node.add({ subject: 'entry:1' }),
          outcome: admitted,
          evidence: EVIDENCE,
          occurrence,
        })
    ).toThrowError(expect.objectContaining({ code: 'E_WRITE_RECEIPT_ENTITY_OCCURRENCE' }));
    expect(
      () =>
        new WriteReceipt({
          lane: 'events',
          writer: 'agent-1',
          intent: intent.entity.add({ subject: 'entry:1', properties: { kind: 'capture' } }),
          outcome: obstructed,
          evidence: EVIDENCE,
          occurrence,
        })
    ).toThrowError(expect.objectContaining({ code: 'E_WRITE_RECEIPT_ENTITY_OCCURRENCE' }));
  });

  it('retains the substrate occurrence on an admitted entity receipt', () => {
    const entityIntent = intent.entity.add({ subject: 'entry:1', properties: { kind: 'capture' } });
    const occurrence = entityOccurrence(entityIntent);
    const receipt = new WriteReceipt({
      lane: 'events',
      writer: 'agent-1',
      intent: entityIntent,
      outcome: projectAdmissionOutcome(
        testDerivedIntentAdmissionReceipt('manual-entity').outcome,
        EVIDENCE.basis
      ),
      evidence: EVIDENCE,
      occurrence,
    });

    expect(receipt.occurrence).toBe(occurrence);
    expect(requireIssuedEntityOccurrence(occurrence, receipt)).toBe(occurrence);
  });

  it('binds ordered plural occurrences to their entity Intents', () => {
    const firstIntent = intent.entity.add({
      subject: 'entry:1',
      properties: { kind: 'capture' },
    });
    const secondIntent = intent.entity.add({
      subject: 'entry:2',
      properties: { kind: 'capture' },
    });
    const first = entityOccurrence(firstIntent, {
      counter: 1,
      opIndex: 0,
      subject: 'entry:1',
    });
    const second = entityOccurrence(secondIntent, {
      counter: 3,
      opIndex: 3,
      subject: 'entry:2',
    });
    const fields = {
      lane: 'events',
      writer: 'agent-1',
      intent: [
        firstIntent,
        intent.edge.add({ from: 'entry:1', to: 'entry:2', label: 'precedes' }),
        secondIntent,
      ],
      outcome: projectAdmissionOutcome(
        testDerivedIntentAdmissionReceipt('manual-atomic-entities').outcome,
        EVIDENCE.basis,
      ),
      evidence: EVIDENCE,
    };

    const receipt = new WriteReceipt({ ...fields, occurrences: [first, second] });

    expect(receipt.occurrence).toBeUndefined();
    expect(receipt.occurrences).toEqual([first, second]);
    expect(receipt.intents).toEqual(fields.intent);
    expect(() => new WriteReceipt({ ...fields, occurrences: [second, first] })).toThrowError(
      expect.objectContaining({ code: 'E_ENTITY_OCCURRENCE_RECEIPT_MISMATCH' }),
    );
    expect(() => new WriteReceipt({ ...fields, occurrences: [first] })).toThrowError(
      expect.objectContaining({ code: 'E_WRITE_RECEIPT_ENTITY_OCCURRENCE' }),
    );
  });

  it('rejects ambiguous or malformed plural occurrence fields', () => {
    const entityIntent = intent.entity.add({
      subject: 'entry:1',
      properties: { kind: 'capture' },
    });
    const occurrence = entityOccurrence(entityIntent);
    const fields = {
      lane: 'events',
      writer: 'agent-1',
      intent: entityIntent,
      outcome: projectAdmissionOutcome(
        testDerivedIntentAdmissionReceipt('manual-occurrence-fields').outcome,
        EVIDENCE.basis,
      ),
      evidence: EVIDENCE,
    };

    expect(() => new WriteReceipt({
      ...fields,
      occurrence,
      occurrences: [occurrence],
    })).toThrowError(expect.objectContaining({ code: 'E_WRITE_RECEIPT_ENTITY_OCCURRENCE' }));
    expect(() => new WriteReceipt({
      ...fields,
      // @ts-expect-error Exercise the JavaScript boundary.
      occurrences: {},
    })).toThrowError(expect.objectContaining({ code: 'E_WRITE_RECEIPT_ENTITY_OCCURRENCE' }));
    expect(() => new WriteReceipt(null)).toThrowError(
      expect.objectContaining({ code: 'E_WRITE_RECEIPT_OPTIONS' }),
    );
  });

  it('distinguishes the causal coordinate writer from the receipt writer', () => {
    const entityIntent = intent.entity.add({ subject: 'entry:1', properties: { kind: 'capture' } });
    const occurrence = entityOccurrence(entityIntent, {
      coordinateWriter: 'strand-overlay',
      receiptWriter: 'agent-1',
    });
    const receipt = new WriteReceipt({
      lane: 'events',
      writer: 'agent-1',
      intent: entityIntent,
      outcome: projectAdmissionOutcome(
        testDerivedIntentAdmissionReceipt('strand-entity').outcome,
        EVIDENCE.basis
      ),
      evidence: EVIDENCE,
      occurrence,
    });

    expect(receipt.occurrence).toBe(occurrence);
  });

  it('rejects a substrate occurrence transplanted to another entity receipt', () => {
    const issuedIntent = intent.entity.add({ subject: 'entry:1', properties: { kind: 'capture' } });
    const occurrence = entityOccurrence(issuedIntent);
    const outcome = projectAdmissionOutcome(
      testDerivedIntentAdmissionReceipt('transplanted-entity').outcome,
      EVIDENCE.basis
    );
    const fields = {
      lane: 'events',
      writer: 'agent-1',
      intent: issuedIntent,
      outcome,
      evidence: EVIDENCE,
      occurrence,
    };
    const mismatches = [
      { ...fields, lane: 'other' },
      { ...fields, writer: 'agent-2' },
      {
        ...fields,
        intent: intent.entity.add({ subject: 'entry:other', properties: { kind: 'capture' } }),
      },
      {
        ...fields,
        evidence: Object.freeze({
          basis: Object.freeze({ id: 'evidence:other' }),
          support: Object.freeze([]),
        }),
      },
    ];

    for (const mismatch of mismatches) {
      expect(() => new WriteReceipt(mismatch)).toThrowError(
        expect.objectContaining({
          code: 'E_ENTITY_OCCURRENCE_RECEIPT_MISMATCH',
        })
      );
    }
  });

  it('rejects an occurrence that was not issued by the substrate', () => {
    const occurrence = Object.create(EntityOccurrence.prototype);
    Object.defineProperties(occurrence, {
      id: { value: 'occurrence:forged' },
      subject: { value: 'entry:forged' },
    });

    expect(
      () =>
        new WriteReceipt({
          lane: 'events',
          writer: 'agent-1',
          intent: intent.entity.add({
            subject: occurrence.subject,
            properties: { kind: 'capture' },
          }),
          outcome: projectAdmissionOutcome(
            testDerivedIntentAdmissionReceipt('forged-entity').outcome,
            EVIDENCE.basis
          ),
          evidence: EVIDENCE,
          occurrence,
        })
    ).toThrowError(expect.objectContaining({ code: 'E_ENTITY_OCCURRENCE_UNAVAILABLE' }));
  });

  it('rejects legacy string write outcomes at runtime', () => {
    expect(
      () =>
        new WriteReceipt({
          lane: 'events',
          writer: 'agent-1',
          intent: intent.node.add({ subject: 'user:alice' }),
          // @ts-expect-error Exercise the JavaScript boundary with a legacy value.
          outcome: 'accepted',
          evidence: EVIDENCE,
        })
    ).toThrow('outcome must be an AdmissionOutcome');
  });

  it.each([
    [null, 'writeReceipt.evidence must be causal evidence'],
    [
      { basis: { id: 'evidence:basis' }, support: null },
      'writeReceipt.evidence.support must be an array',
    ],
    [{ basis: null, support: [] }, 'writeReceipt.evidence.basis must be an evidence handle'],
    [
      { basis: { id: 'evidence:basis' }, support: [null] },
      'writeReceipt.evidence.support[0] must be an evidence handle',
    ],
    [
      { basis: { id: 'evidence:basis' }, support: [], tick: {} },
      'writeReceipt.evidence.tick must be a Tick',
    ],
  ])('rejects malformed causal evidence %#', (evidence, message) => {
    const outcome = projectAdmissionOutcome(
      testDerivedIntentAdmissionReceipt('malformed-evidence').outcome,
      EVIDENCE.basis
    );
    expect(
      () =>
        new WriteReceipt({
          lane: 'events',
          writer: 'agent-1',
          intent: intent.node.add({ subject: 'user:alice' }),
          outcome,
          // @ts-expect-error Exercise the JavaScript boundary with malformed evidence.
          evidence,
        })
    ).toThrow(message);
  });
});

function entityOccurrence(
  entityIntent = intent.entity.add({ subject: 'entry:1', properties: { kind: 'capture' } }),
  writers: {
    readonly counter?: number;
    readonly coordinateWriter?: string;
    readonly opIndex?: number;
    readonly receiptWriter?: string;
    readonly subject?: string;
  } = {}
) {
  const coordinateWriter = writers.coordinateWriter ?? 'agent-1';
  const counter = writers.counter ?? 1;
  return createEntityOccurrence({
    context: { [coordinateWriter]: counter },
    dot: Dot.create(coordinateWriter, counter),
    evidence: EVIDENCE,
    eventId: new EventId(1, coordinateWriter, 'aaaa', writers.opIndex ?? 0),
    intent: entityIntent,
    receiptWriter: writers.receiptWriter ?? coordinateWriter,
    subject: writers.subject ?? 'entry:1',
    worldline: 'events',
  });
}

function conflictOutcome() {
  return projectAdmissionOutcome(
    new ConflictAdmission(
      new ConflictWitness({
        evaluation: new AdmissionEvaluation({
          sourceParticipantId: 'agent-1',
          destinationRuntimeId: 'runtime:events',
          sourceBasisRef: 'frontier:source',
          destinationBasisRef: 'frontier:destination',
          proposalDigest: 'proposal:entity',
          lawDigest: 'law:entity',
          profileDigest: 'profile:test',
          evaluationCoordinateRef: 'coordinate:destination',
        }),
        conflictRef: 'conflict:entity',
        claimRefs: ['claim:local', 'claim:incoming'],
        overlappingFootprintRefs: ['footprint:entity'],
        contestedDomain: 'entity',
        derivationEvidenceRef: 'evidence:derivation',
        overlapEvidenceRef: 'evidence:overlap',
        resolutionProcedureRefs: ['procedure:settle'],
      })
    ),
    EVIDENCE.basis
  );
}
