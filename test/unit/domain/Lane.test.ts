import { beforeEach, describe, expect, it, vi } from 'vitest';

import Lane from '../../../src/domain/api/Lane.ts';
import Observer from '../../../src/domain/api/Observer.ts';

const startObserver = vi.fn();

function roleObserver(): Observer<string> {
  return new Observer<string>({
    cardinality: 'exactly-one',
    decode: (value) => {
      if (typeof value !== 'string') {
        throw new TypeError('users.role-of expected a string');
      }
      return value;
    },
    id: 'users.role-of',
  });
}

describe('Lane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates its construction boundary', () => {
    expect(() => new Lane(null)).toThrow(
      expect.objectContaining({ code: 'E_LANE_OPTIONS' }),
    );
    expect(() => new Lane(undefined)).toThrow(
      expect.objectContaining({ code: 'E_LANE_OPTIONS' }),
    );
    expect(() => new Lane({
      // @ts-expect-error Exercise the JavaScript boundary.
      startObserver: 'invalid',
    })).toThrow(expect.objectContaining({ code: 'E_LANE_OBSERVER' }));
  });

  it('rejects an observe call without an Observer', () => {
    const lane = new Lane({ startObserver });
    // @ts-expect-error Exercise the JavaScript boundary.
    expect(() => lane.observe({})).toThrow(
      expect.objectContaining({ code: 'E_LANE_OBSERVE_OBSERVER' }),
    );
  });

  it('constructs an Observation without starting runtime work', () => {
    const lane = new Lane({ startObserver });
    const observer = roleObserver();

    const observation = lane.observe(observer);

    expect(observation.observer).toBe(observer);
    expect(startObserver).not.toHaveBeenCalled();
  });

  it('starts its observer when the observation is consumed', async () => {
    const lane = new Lane({ startObserver });
    const observer = roleObserver();
    startObserver.mockResolvedValue({
      readings: (async function* () {})(),
      receipt: Promise.resolve('receipt'),
    });

    const observation = lane.observe(observer);
    for await (const reading of observation) {
      expect(reading).toBeUndefined();
    }

    expect(startObserver).toHaveBeenCalledWith(observer);
  });

  it('is frozen and has no write, staging or identity members', () => {
    const lane = new Lane({ startObserver });

    expect(Object.isFrozen(lane)).toBe(true);
    for (const member of ['write', 'stageContent', 'name', 'kind', 'descriptor', 'reference', 'writer']) {
      expect(member in lane).toBe(false);
    }
  });
});
