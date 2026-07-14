import { describe, expect, it, vi } from 'vitest';

import IntentController, {
  type IntentHost,
} from '../../../../../src/domain/services/controllers/IntentController.ts';
import type { WarpIntentDescriptor } from '../../../../../src/domain/types/WarpIntentDescriptor.ts';

const descriptor: WarpIntentDescriptor = {
  intentId: 'assign-alice',
  nutritionLabel: {
    bundleHash: 'bundle',
    coreHash: 'core',
    profile: 'default',
    budget: 'bounded',
  },
  precommitGuards: [],
  suffixTransform: {
    op: 'property.set',
    payload: { subject: 'user:alice', key: 'role', value: 'admin' },
  },
};

describe('IntentController', () => {
  it('admits a descriptor without writing an unattached persistence blob', async () => {
    const writeBlob = vi.fn(async () => 'a'.repeat(40));
    const host = {
      _graphName: 'events',
      _writerId: 'agent-1',
      _persistence: { writeBlob },
      worldline: () => ({ getNodeProps: vi.fn() }),
    } as unknown as IntentHost;
    const controller = new IntentController(host);

    await expect(controller.admitIntent(descriptor)).resolves.toEqual({
      admitted: true,
      intentId: 'assign-alice',
      sha: 'intent:assign-alice:agent-1:1',
    });
    expect(writeBlob).not.toHaveBeenCalled();
  });
});
