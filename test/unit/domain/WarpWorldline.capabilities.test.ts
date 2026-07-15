import { describe, expect, it } from 'vitest';

import WarpWorldline from '../../../src/domain/WarpWorldline.ts';
import MemoryCapabilityReport from '../../../src/domain/memory/MemoryCapabilityReport.ts';
import ProjectionHandle from '../../../src/domain/services/ProjectionHandle.ts';
import { testRetentionWitness } from '../../helpers/storageRetention.ts';

function createHandle(): WarpWorldline {
  return new WarpWorldline({
    worldlineName: 'events',
    writerId: 'agent-1',
    commitPatch: async () => 'patch-sha',
    createWorldline: () => new ProjectionHandle({
      graph: {
        observer: async () => {
          throw new Error('unused observer path');
        },
      },
    }),
    admitIntent: async (descriptor) => ({
      admitted: true,
      sha: 'blob:intent:123',
      intentId: descriptor.intentId,
      retention: testRetentionWitness('intent-123'),
    }),
  });
}

describe('WarpWorldline capabilities', () => {
  it('reports bounded-memory truth without widening the materialization surface', () => {
    const report = createHandle().capabilities();

    expect(report).toBeInstanceOf(MemoryCapabilityReport);
    expect(Object.isFrozen(report)).toBe(true);
    expect(report.requireCapability('memory-budget-contract').posture.toString()).toBe('safe');
    expect(report.requireCapability('checkpoint-tail-optics').posture.toString()).toBe('transitional');
    expect(report.requireCapability('graph-wide-materialization').posture.toString()).toBe('diagnostic');
    expect(report.requireCapability('legacy-query-arrays').posture.toString()).toBe('legacy');
    expect(report.safeNames()).toEqual(['memory-budget-contract']);
  });
});
