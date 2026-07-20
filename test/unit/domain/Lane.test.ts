import { describe, expect, it, vi } from 'vitest';

import Lane from '../../../src/domain/api/Lane.ts';
import Observer from '../../../src/domain/api/Observer.ts';

const writeIntent = vi.fn();
const startObserver = vi.fn();

describe('Lane', () => {
  it('keeps worldline and strand descriptors mutually exclusive', () => {
    expect(() => new Lane({
      descriptor: {
        kind: 'worldline',
        name: 'events',
        parent: { kind: 'worldline', name: 'main' },
      } as never,
      startObserver,
      writeIntent,
      writer: 'agent-1',
    })).toThrowError(expect.objectContaining({ code: 'E_LANE_KIND_OVERLAP' }));

    const strand = new Lane({
      descriptor: {
        forkedAt: {
          id: 'coordinate:1',
          lane: { kind: 'worldline', name: 'events' },
        },
        kind: 'strand',
        name: 'try-admin-role',
        parent: { kind: 'worldline', name: 'events' },
      },
      startObserver,
      writeIntent,
      writer: 'agent-1',
    });

    expect(strand.kind).toBe('strand');
    expect(strand.descriptor).toEqual({
      forkedAt: {
        id: 'coordinate:1',
        lane: { kind: 'worldline', name: 'events' },
      },
      kind: 'strand',
      name: 'try-admin-role',
      parent: { kind: 'worldline', name: 'events' },
    });
    expect(Object.isFrozen(strand.descriptor)).toBe(true);
  });

  it('rejects a strand fork coordinate from another parent', () => {
    expect(() => new Lane({
      descriptor: {
        forkedAt: {
          id: 'coordinate:1',
          lane: { kind: 'worldline', name: 'other' },
        },
        kind: 'strand',
        name: 'try-admin-role',
        parent: { kind: 'worldline', name: 'events' },
      },
      startObserver,
      writeIntent,
      writer: 'agent-1',
    })).toThrow(expect.objectContaining({ code: 'E_LANE_FORK_PARENT' }));
  });

  it('constructs an Observation without starting runtime work', () => {
    const lane = new Lane({
      descriptor: { kind: 'worldline', name: 'events' },
      startObserver,
      writeIntent,
      writer: 'agent-1',
    });
    const observer = new Observer<string>({
      cardinality: 'exactly-one',
      decode: (value) => {
        if (typeof value !== 'string') {
          throw new TypeError('users.role-of expected a string');
        }
        return value;
      },
      id: 'users.role-of',
    });

    const observation = lane.observe(observer);

    expect(observation.observer).toBe(observer);
    expect(startObserver).not.toHaveBeenCalled();
  });

  it('rejects loose intents at the write boundary', async () => {
    const lane = new Lane({
      descriptor: { kind: 'worldline', name: 'events' },
      startObserver,
      writeIntent,
      writer: 'agent-1',
    });

    await expect(lane.write({ kind: 'node.add' } as never)).rejects.toMatchObject({
      code: 'E_LANE_WRITE_INTENT',
    });
    expect(writeIntent).not.toHaveBeenCalled();
  });
});
