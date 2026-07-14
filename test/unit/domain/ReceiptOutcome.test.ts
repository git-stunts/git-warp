import { describe, expect, it } from 'vitest';

import DraftTimeline from '../../../src/domain/api/DraftTimeline.ts';
import { intent } from '../../../src/domain/api/IntentBuilders.ts';
import JoinReceipt from '../../../src/domain/api/JoinReceipt.ts';
import { RECEIPT_OUTCOMES } from '../../../src/domain/api/ReceiptOutcome.ts';
import WriteReceipt from '../../../src/domain/api/WriteReceipt.ts';

const EVIDENCE = Object.freeze({
  basis: Object.freeze({ id: 'evidence:basis' }),
  support: Object.freeze([]),
});

describe('receipt outcomes', () => {
  it('locks the canonical outcome axis to the approved five values', () => {
    expect([...RECEIPT_OUTCOMES]).toEqual([
      'accepted',
      'obstructed',
      'conflicted',
      'underdetermined',
      'rejected',
    ]);
  });

  it('shares the canonical write receipt outcomes with join receipts', () => {
    const draft = new DraftTimeline({
      name: 'try-admin-role',
      timeline: 'events',
      writer: 'agent-1',
    });

    for (const outcome of RECEIPT_OUTCOMES) {
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

  it('represents rejected writes without inventing causal evidence', () => {
    const receipt = new WriteReceipt({
      timeline: 'events',
      writer: 'agent-1',
      intent: intent.node.add({ subject: 'user:alice' }),
      outcome: 'rejected',
      reason: 'policy_rejected',
    });

    expect(receipt).toMatchObject({
      operation: 'write',
      outcome: 'rejected',
      reason: 'policy_rejected',
      evidence: undefined,
    });
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
    expect(
      () =>
        new WriteReceipt({
          timeline: 'events',
          writer: 'agent-1',
          intent: intent.node.add({ subject: 'user:alice' }),
          outcome: 'accepted',
          evidence: evidence as never,
        })
    ).toThrow(message);
  });
});
