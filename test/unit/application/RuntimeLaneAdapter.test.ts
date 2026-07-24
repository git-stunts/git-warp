import { describe, expect, it, vi } from 'vitest';

import { openWarp } from '../../../src/application/openWarp.ts';
import RuntimeActivity from '../../../src/application/RuntimeActivity.ts';
import { createWorldlineLane } from '../../../src/application/RuntimeLaneAdapter.ts';
import Intent from '../../../src/domain/api/Intent.ts';
import {
  createManyObserver,
  createObserver,
} from '../../../src/domain/api/ObserverRuntime.ts';
import LegacyReading from '../../../src/domain/api/Reading.ts';
import captureCoordinate from '../../../src/domain/api/captureCoordinate.ts';
import { createBoundedReadBasis } from '../../helpers/BoundedReadBasis.ts';
import MemoryStorage from '../../helpers/MemoryStorage.ts';

describe('Runtime Lane adapter', () => {
  it('streams an accepted bounded Reading and leaves one Observation receipt', async () => {
    const storage = MemoryStorage.create();
    try {
      const warp = await openWarp({ storage, writer: 'agent-1' });
      const timeline = await warp.timeline('events');
      const lane = createWorldlineLane(timeline, new RuntimeActivity());
      await lane.write(Intent.addNode({ subject: 'user:alice' }));
      await lane.write(Intent.setProperty({
        subject: 'user:alice',
        key: 'role',
        value: 'admin',
      }));
      await createBoundedReadBasis(storage, 'events');
      const observer = createObserver<string>(
        'users.role-of',
        LegacyReading.property({ subject: 'user:alice', key: 'role' }),
        (value) => {
          if (typeof value !== 'string') {
            throw new TypeError('users.role-of expected a string');
          }
          return value;
        },
      );

      const observation = lane.observe(observer);
      const reading = await observation.one();
      const receipt = await observation.receipt;

      expect(reading.value).toBe('admin');
      expect(reading.coordinate.lane).toBe('events');
      expect(reading.coordinate.basis.id).toMatch(/^evidence:/u);
      expect(reading.support.status).toBe('supported');
      expect(reading.witnessRefs).toEqual([]);
      expect(receipt).toMatchObject({
        lane: 'events',
        operation: 'observe',
        status: 'completed',
        writer: 'agent-1',
      });
      expect(receipt.observer).toBe(observer);
    } finally {
      await storage.close();
    }
  });

  it('records a missing bounded basis as obstruction rather than runtime failure', async () => {
    const storage = MemoryStorage.create();
    try {
      const warp = await openWarp({ storage, writer: 'agent-1' });
      const timeline = await warp.timeline('events');
      const lane = createWorldlineLane(timeline, new RuntimeActivity());
      const observer = createObserver<boolean>(
        'users.exists',
        LegacyReading.nodeExists({ subject: 'user:alice' }),
        (value) => {
          if (typeof value !== 'boolean') {
            throw new TypeError('users.exists expected a boolean');
          }
          return value;
        },
      );

      await expect(lane.observe(observer).receipt).resolves.toMatchObject({
        operation: 'observe',
        reason: 'missing_bounded_basis',
        status: 'obstructed',
      });
    } finally {
      await storage.close();
    }
  });

  it('streams a many Observer lazily against one pinned Tick', async () => {
    const storage = MemoryStorage.create();
    try {
      const warp = await openWarp({ storage, writer: 'agent-1' });
      const timeline = await warp.timeline('events');
      const lane = createWorldlineLane(timeline, new RuntimeActivity());
      const subjects = ['user:alice', 'user:bob', 'user:carol'];
      for (const [index, subject] of subjects.entries()) {
        await lane.write(Intent.addNode({ subject }));
        await lane.write(Intent.setProperty({
          subject,
          key: 'rank',
          value: index + 1,
        }));
      }
      await createBoundedReadBasis(storage, 'events');
      let planned = 0;
      const observer = createManyObserver<number>(
        'users.ranks',
        function* () {
          for (const subject of subjects) {
            planned += 1;
            yield LegacyReading.property({ subject, key: 'rank' });
          }
        },
        (value) => {
          if (typeof value !== 'number') {
            throw new TypeError('users.ranks expected a number');
          }
          return value;
        },
      );
      const observation = lane.observe(observer);
      const iterator = observation[Symbol.asyncIterator]();

      expect(planned).toBe(0);
      const first = await iterator.next();
      expect(first).toMatchObject({ done: false, value: { value: 1 } });
      expect(planned).toBe(1);
      const second = await iterator.next();
      expect(second).toMatchObject({ done: false, value: { value: 2 } });
      expect(planned).toBe(2);
      const third = await iterator.next();
      expect(third).toMatchObject({ done: false, value: { value: 3 } });
      expect(planned).toBe(3);
      await expect(iterator.next()).resolves.toEqual({ done: true, value: undefined });

      const tickIds = [first, second, third].map((result) =>
        result.done === false ? result.value.coordinate.tick?.id : undefined
      );
      expect(new Set(tickIds).size).toBe(1);
      await expect(observation.receipt).resolves.toMatchObject({
        observer,
        status: 'completed',
      });
    } finally {
      await storage.close();
    }
  });

  it('drains a receipt-first many Observer without collecting Readings', async () => {
    const storage = MemoryStorage.create();
    try {
      const warp = await openWarp({ storage, writer: 'agent-1' });
      const timeline = await warp.timeline('events');
      const lane = createWorldlineLane(timeline, new RuntimeActivity());
      const subjects = ['user:alice', 'user:bob', 'user:carol'];
      for (const subject of subjects) {
        await lane.write(Intent.addNode({ subject }));
      }
      await createBoundedReadBasis(storage, 'events');
      let planned = 0;
      let decoded = 0;
      const observer = createManyObserver<boolean>(
        'users.exist',
        function* () {
          for (const subject of subjects) {
            planned += 1;
            yield LegacyReading.nodeExists({ subject });
          }
        },
        (value) => {
          decoded += 1;
          if (typeof value !== 'boolean') {
            throw new TypeError('users.exist expected a boolean');
          }
          return value;
        },
      );
      const observation = lane.observe(observer);

      await expect(observation.receipt).resolves.toMatchObject({ status: 'completed' });
      expect(planned).toBe(3);
      expect(decoded).toBe(3);
      await expect(observation[Symbol.asyncIterator]().next()).rejects.toMatchObject({
        code: 'E_OBSERVATION_DRAINING',
      });
    } finally {
      await storage.close();
    }
  });

  it('completes an empty many Observer with pinned-basis evidence', async () => {
    const storage = MemoryStorage.create();
    try {
      const warp = await openWarp({ storage, writer: 'agent-1' });
      const timeline = await warp.timeline('events');
      const lane = createWorldlineLane(timeline, new RuntimeActivity());
      await lane.write(Intent.addNode({ subject: 'user:alice' }));
      await createBoundedReadBasis(storage, 'events');
      const observer = createManyObserver<boolean>(
        'users.empty',
        () => [],
        (value) => Boolean(value),
      );
      const observation = lane.observe(observer);

      await expect(observation[Symbol.asyncIterator]().next()).resolves.toEqual({
        done: true,
        value: undefined,
      });
      await expect(observation.receipt).resolves.toMatchObject({
        evidence: {
          support: [],
          tick: expect.objectContaining({ timeline: 'events' }),
        },
        status: 'completed',
      });
    } finally {
      await storage.close();
    }
  });

  it('obstructs an empty many Observer when no bounded basis exists', async () => {
    const storage = MemoryStorage.create();
    try {
      const warp = await openWarp({ storage, writer: 'agent-1' });
      const timeline = await warp.timeline('events');
      const lane = createWorldlineLane(timeline, new RuntimeActivity());
      const observer = createManyObserver<boolean>(
        'users.empty',
        () => [],
        (value) => Boolean(value),
      );

      await expect(lane.observe(observer).receipt).resolves.toMatchObject({
        operation: 'observe',
        reason: 'missing_bounded_basis',
        status: 'obstructed',
      });
    } finally {
      await storage.close();
    }
  });

  it('records consumer cancellation and releases Runtime activity', async () => {
    const storage = MemoryStorage.create();
    try {
      const warp = await openWarp({ storage, writer: 'agent-1' });
      const timeline = await warp.timeline('events');
      const activity = new RuntimeActivity();
      const lane = createWorldlineLane(timeline, activity);
      await lane.write(Intent.addNode({ subject: 'user:alice' }));
      await createBoundedReadBasis(storage, 'events');
      const observer = createManyObserver<boolean>(
        'users.exist',
        function* () {
          yield LegacyReading.nodeExists({ subject: 'user:alice' });
          yield LegacyReading.nodeExists({ subject: 'user:bob' });
        },
        (value) => {
          if (typeof value !== 'boolean') {
            throw new TypeError('users.exist expected a boolean');
          }
          return value;
        },
      );
      const observation = lane.observe(observer);
      const iterator = observation[Symbol.asyncIterator]();
      await iterator.next();
      const release = vi.fn(async () => {});
      const closing = activity.close(release);

      expect(release).not.toHaveBeenCalled();
      await iterator.return?.();
      await expect(observation.receipt).resolves.toMatchObject({
        reason: 'consumer_cancelled',
        status: 'obstructed',
      });
      await closing;
      expect(release).toHaveBeenCalledOnce();
    } finally {
      await storage.close();
    }
  });

  it('rejects incompatible generated values as runtime failures', async () => {
    const storage = MemoryStorage.create();
    try {
      const warp = await openWarp({ storage, writer: 'agent-1' });
      const timeline = await warp.timeline('events');
      const lane = createWorldlineLane(timeline, new RuntimeActivity());
      await lane.write(Intent.addNode({ subject: 'user:alice' }));
      await lane.write(Intent.setProperty({
        subject: 'user:alice',
        key: 'role',
        value: 42,
      }));
      await createBoundedReadBasis(storage, 'events');
      const observer = createObserver<string>(
        'users.role-of',
        LegacyReading.property({ subject: 'user:alice', key: 'role' }),
        (value) => {
          if (typeof value !== 'string') {
            throw new TypeError('users.role-of expected a string');
          }
          return value;
        },
      );
      const observation = lane.observe(observer);

      await expect(observation.one()).rejects.toThrow('users.role-of expected a string');
      await expect(observation.receipt).rejects.toThrow('users.role-of expected a string');
    } finally {
      await storage.close();
    }
  });

  it('guards advanced coordinate capture with the Runtime lifecycle', async () => {
    const storage = MemoryStorage.create();
    try {
      const warp = await openWarp({ storage, writer: 'agent-1' });
      const timeline = await warp.timeline('events');
      const activity = new RuntimeActivity();
      const lane = createWorldlineLane(timeline, activity);
      await activity.close(async () => {});

      await expect(captureCoordinate(lane)).rejects.toMatchObject({
        code: 'E_RUNTIME_CLOSED',
      });
    } finally {
      await storage.close();
    }
  });

  it('rejects a many Observer without a reading-plan factory', () => {
    expect(() => createManyObserver(
      'users.invalid',
      undefined as never,
      (value) => value,
    )).toThrowError(expect.objectContaining({ code: 'E_OBSERVER_PLAN' }));
  });
});
