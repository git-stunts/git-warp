import { beforeEach, describe, expect, it, vi } from 'vitest';

import Intent from '../../../src/domain/api/Intent.ts';
import Lane from '../../../src/domain/api/Lane.ts';
import Observer from '../../../src/domain/api/Observer.ts';

const writeIntent = vi.fn();
const startObserver = vi.fn();

describe('Lane', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validates its construction boundary', () => {
    expect(() => new Lane(null)).toThrow(
      expect.objectContaining({ code: 'E_LANE_OPTIONS' }),
    );
    expect(() => new Lane({
      descriptor: { kind: 'worldline', name: 'events' },
      // @ts-expect-error Exercise the JavaScript boundary.
      startObserver: 'invalid',
      writeIntent,
      writer: 'agent-1',
    })).toThrow(expect.objectContaining({ code: 'E_LANE_OBSERVER' }));
    expect(() => new Lane({
      descriptor: { kind: 'worldline', name: 'events' },
      startObserver,
      // @ts-expect-error Exercise the JavaScript boundary.
      writeIntent: 'invalid',
      writer: 'agent-1',
    })).toThrow(expect.objectContaining({ code: 'E_LANE_WRITER' }));
  });

  it('exposes its identity and delegates admitted writes', async () => {
    const lane = new Lane({
      descriptor: { kind: 'worldline', name: 'events' },
      startObserver,
      writeIntent,
      writer: 'agent-1',
    });
    const intent = Intent.addNode({ subject: 'user:alice' });

    await lane.write(intent);

    expect(lane.name).toBe('events');
    expect(lane.reference).toEqual({ kind: 'worldline', name: 'events' });
    expect(lane.writer).toBe('agent-1');
    expect(writeIntent).toHaveBeenCalledWith(intent);
  });

  it('rejects invalid observers and descriptor shapes', () => {
    const lane = new Lane({
      descriptor: { kind: 'worldline', name: 'events' },
      startObserver,
      writeIntent,
      writer: 'agent-1',
    });
    // @ts-expect-error Exercise the JavaScript boundary.
    expect(() => lane.observe({})).toThrow(
      expect.objectContaining({ code: 'E_LANE_OBSERVE_OBSERVER' }),
    );
    expect(() => new Lane({
      // @ts-expect-error Exercise the JavaScript boundary.
      descriptor: null,
      startObserver,
      writeIntent,
      writer: 'agent-1',
    })).toThrow(expect.objectContaining({ code: 'E_LANE_DESCRIPTOR' }));
    expect(() => new Lane({
      // @ts-expect-error Exercise the JavaScript boundary.
      descriptor: { kind: 'future', name: 'events' },
      startObserver,
      writeIntent,
      writer: 'agent-1',
    })).toThrow(expect.objectContaining({ code: 'E_LANE_KIND' }));
  });

  it('rejects incomplete strand coordinates and Lane references', () => {
    expect(() => new Lane({
      descriptor: {
        // @ts-expect-error Exercise the JavaScript boundary.
        forkedAt: null,
        kind: 'strand',
        name: 'trial',
        parent: { kind: 'worldline', name: 'events' },
      },
      startObserver,
      writeIntent,
      writer: 'agent-1',
    })).toThrow(expect.objectContaining({ code: 'E_LANE_FORK_COORDINATE' }));
    expect(() => new Lane({
      descriptor: {
        forkedAt: {
          id: 'coordinate:1',
          lane: { kind: 'worldline', name: 'events' },
        },
        kind: 'strand',
        name: 'trial',
        // @ts-expect-error Exercise the JavaScript boundary.
        parent: null,
      },
      startObserver,
      writeIntent,
      writer: 'agent-1',
    })).toThrow(expect.objectContaining({ code: 'E_LANE_REFERENCE' }));
    expect(() => new Lane({
      descriptor: {
        forkedAt: {
          id: 'coordinate:1',
          // @ts-expect-error Exercise the JavaScript boundary.
          lane: { kind: 'future', name: 'events' },
        },
        kind: 'strand',
        name: 'trial',
        // @ts-expect-error Exercise the JavaScript boundary.
        parent: { kind: 'future', name: 'events' },
      },
      startObserver,
      writeIntent,
      writer: 'agent-1',
    })).toThrow(expect.objectContaining({ code: 'E_LANE_REFERENCE_KIND' }));
  });

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
