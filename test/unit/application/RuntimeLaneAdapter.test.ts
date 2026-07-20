import { describe, expect, it } from 'vitest';

import { openWarp } from '../../../src/application/openWarp.ts';
import RuntimeActivity from '../../../src/application/RuntimeActivity.ts';
import { createWorldlineLane } from '../../../src/application/RuntimeLaneAdapter.ts';
import Intent from '../../../src/domain/api/Intent.ts';
import { createObserver } from '../../../src/domain/api/ObserverRuntime.ts';
import LegacyReading from '../../../src/domain/api/Reading.ts';
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
});
