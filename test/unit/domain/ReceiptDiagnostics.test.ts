import { describe, expect, it } from 'vitest';

import { inspectReceipt } from '../../../diagnostics.ts';
import { intent } from '../../../src/domain/api/IntentBuilders.ts';
import WriteReceipt from '../../../src/domain/api/WriteReceipt.ts';

describe('receipt diagnostics', () => {
  it('inspects accepted write receipts without requiring substrate handles', () => {
    const receipt = new WriteReceipt({
      timeline: 'events',
      writer: 'agent-1',
      intent: intent.node.add({ subject: 'user:alice' }),
      outcome: 'accepted',
      patchSha: 'patch-1',
    });

    expect(inspectReceipt(receipt)).toEqual({
      operation: 'write',
      outcome: 'accepted',
      timeline: 'events',
      writer: 'agent-1',
      reason: undefined,
      evidence: 'absent',
      objectIds: ['patch-1'],
    });
  });

  it('does not invent object identities for rejected writes', () => {
    const receipt = new WriteReceipt({
      timeline: 'events',
      writer: 'agent-1',
      intent: intent.node.add({ subject: 'user:alice' }),
      outcome: 'rejected',
      reason: 'policy_rejected',
    });

    expect(inspectReceipt(receipt).objectIds).toEqual([]);
  });
});
