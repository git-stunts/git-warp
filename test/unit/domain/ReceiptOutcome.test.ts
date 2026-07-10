import { describe, expect, it } from 'vitest';

import DraftTimeline from '../../../src/domain/api/DraftTimeline.ts';
import JoinReceipt from '../../../src/domain/api/JoinReceipt.ts';
import { RECEIPT_OUTCOMES } from '../../../src/domain/api/WriteReceipt.ts';

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
      });

      expect(receipt.outcome).toBe(outcome);
    }
  });
});
