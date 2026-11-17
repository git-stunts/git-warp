import { describe, expect, it, vi } from 'vitest';

import Lane from '../../../src/domain/api/Lane.ts';
import { bindLaneRuntime, requireLaneRuntime } from '../../../src/domain/api/LaneRuntime.ts';

function lane(): Lane {
  return new Lane({ startObserver: vi.fn() });
}

describe('LaneRuntime', () => {
  it('binds only the coordinate capture port, once', () => {
    const bound = lane();
    const captureCoordinate = vi.fn();
    bindLaneRuntime(bound, { captureCoordinate });

    const runtime = requireLaneRuntime(bound);
    expect(Object.keys(runtime)).toEqual(['captureCoordinate']);
    expect(runtime.captureCoordinate).toBe(captureCoordinate);
    expect(Object.isFrozen(runtime)).toBe(true);
    expect(() => bindLaneRuntime(bound, { captureCoordinate })).toThrow(
      expect.objectContaining({ code: 'E_LANE_RUNTIME_BOUND' }),
    );
  });

  it('refuses a Lane no Runtime opened', () => {
    expect(() => requireLaneRuntime(lane())).toThrow(
      expect.objectContaining({ code: 'E_LANE_RUNTIME_UNAVAILABLE' }),
    );
  });
});
