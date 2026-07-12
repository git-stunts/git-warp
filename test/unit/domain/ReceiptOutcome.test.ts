import { describe, expect, it } from 'vitest';

import DraftTimeline from '../../../src/domain/api/DraftTimeline.ts';
import { intent } from '../../../src/domain/api/IntentBuilders.ts';
import JoinReceipt from '../../../src/domain/api/JoinReceipt.ts';
import WriteReceipt, { RECEIPT_OUTCOMES } from '../../../src/domain/api/WriteReceipt.ts';

describe('receipt outcomes', () => {
  it('shares the canonical write receipt outcomes with join receipts', () => {
    const draft = new DraftTimeline({
      name: 'try-admin-role',
      timeline: 'events',
      writer: 'agent-1',
    });

    for (const outcome of RECEIPT_OUTCOMES) {
      const receipt = new JoinReceipt({
        timeline: 'events',
        writer: 'agent-1',
        draft,
        mode: 'join',
        outcome,
        ...(outcome === 'accepted' ? {} : { reason: `join_${outcome}` }),
      });

      expect(receipt.outcome).toBe(outcome);
      expect(receipt.operation).toBe('join');
    }
  });

  it('represents rejected writes without inventing patch identities', () => {
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
      patchSha: undefined,
    });
  });
});
