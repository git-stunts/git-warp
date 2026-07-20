import { describe, expect, it } from 'vitest';

import DraftTimeline from '../../../src/domain/api/DraftTimeline.ts';
import { projectAdmissionOutcome } from '../../../src/domain/api/AdmissionOutcomeRuntime.ts';
import { intent } from '../../../src/domain/api/IntentBuilders.ts';
import JoinReceipt from '../../../src/domain/api/JoinReceipt.ts';
import { READ_JOIN_RECEIPT_OUTCOMES } from '../../../src/domain/api/ReceiptOutcome.ts';
import WriteReceipt from '../../../src/domain/api/WriteReceipt.ts';
import {
  testDerivedIntentAdmissionReceipt,
  testObstructedIntentAdmissionReceipt,
} from '../../helpers/intentAdmission.ts';

const EVIDENCE = Object.freeze({
  basis: Object.freeze({ id: 'evidence:basis' }),
  support: Object.freeze([]),
});

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
      timeline: 'events',
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

  it('rejects legacy string write outcomes at runtime', () => {
    expect(
      () =>
        new WriteReceipt({
          timeline: 'events',
          writer: 'agent-1',
          intent: intent.node.add({ subject: 'user:alice' }),
          outcome: 'accepted' as never,
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
          timeline: 'events',
          writer: 'agent-1',
          intent: intent.node.add({ subject: 'user:alice' }),
          outcome,
          evidence: evidence as never,
        })
    ).toThrow(message);
  });
});
