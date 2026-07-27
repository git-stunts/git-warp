import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Runtime } from '../../../index.ts';
import RuntimeHost from '../../../src/domain/RuntimeHost.ts';
import Intent from '../../../src/domain/api/Intent.ts';
import { createObserver } from '../../../src/domain/api/ObserverRuntime.ts';
import LegacyReading from '../../../src/domain/api/Reading.ts';
import { createTestRepo } from '../api/helpers/setup.ts';

describe('Runtime fork composition', () => {
  let repository: Awaited<ReturnType<typeof createTestRepo>>;

  beforeEach(async () => {
    repository = await createTestRepo('runtime-fork');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await repository.cleanup();
  });

  it('pins a real-Git parent coordinate and reads the strand without full materialization', async () => {
    const materialize = vi.spyOn(RuntimeHost.prototype, 'materialize');
    const runtime = await Runtime.open({
      at: repository.tempDir,
      writer: 'agent-1',
    });
    try {
      const events = await runtime.lane('events');
      await events.write(Intent.addNode({ subject: 'user:alice' }));
      await events.write(Intent.setProperty({
        subject: 'user:alice',
        key: 'role',
        value: 'member',
      }));
      const strand = await runtime.fork(events, { name: 'try-admin-role' });
      expect(strand.descriptor).toMatchObject({
        kind: 'strand',
        name: 'try-admin-role',
        parent: { kind: 'worldline', name: 'events' },
        forkedAt: {
          id: expect.stringMatching(/^tick:/u),
          lane: { kind: 'worldline', name: 'events' },
        },
      });
      await expect(runtime.fork(events, { name: 'try-admin-role' }))
        .rejects.toMatchObject({ code: 'E_STRAND_ALREADY_EXISTS' });
      materialize.mockClear();

      await events.write(Intent.setProperty({
        subject: 'user:alice',
        key: 'role',
        value: 'owner',
      }));
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

      await expect(strand.observe(observer).one()).resolves.toMatchObject({
        value: 'member',
      });
      await strand.write(Intent.setProperty({
        subject: 'user:alice',
        key: 'role',
        value: 'admin',
      }));
      await expect(strand.observe(observer).one()).resolves.toMatchObject({
        value: 'admin',
      });
      await expect(events.observe(observer).one()).resolves.toMatchObject({
        value: 'owner',
      });
      expect(materialize).not.toHaveBeenCalled();
    } finally {
      await runtime.close();
    }
  });

  it('reopens and settles a persisted strand in a later Runtime', async () => {
    const first = await Runtime.open({
      at: repository.tempDir,
      writer: 'agent-1',
    });
    let forkTickId: string;
    try {
      const events = await first.lane('events');
      await events.write(Intent.addNode({ subject: 'user:alice' }));
      await events.write(Intent.setProperty({
        subject: 'user:alice',
        key: 'role',
        value: 'member',
      }));
      const strand = await first.fork(events, { name: 'try-admin-role' });
      forkTickId = strand.descriptor.kind === 'strand'
        ? strand.descriptor.forkedAt.id
        : '';
      await strand.write(Intent.setProperty({
        subject: 'user:alice',
        key: 'role',
        value: 'admin',
      }));
    } finally {
      await first.close();
    }

    const second = await Runtime.open({
      at: repository.tempDir,
      writer: 'agent-1',
    });
    try {
      const events = await second.lane('events');
      const strand = await second.strand(events, { name: 'try-admin-role' });
      expect(strand.descriptor).toMatchObject({
        kind: 'strand',
        name: 'try-admin-role',
        parent: events.reference,
        forkedAt: { id: forkTickId, lane: events.reference },
      });
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
      await expect(strand.observe(observer).one()).resolves.toMatchObject({
        value: 'admin',
      });

      const preview = await second.previewSettlement({
        source: strand,
        target: events,
      });
      await expect(second.settle(preview.plan)).resolves.toMatchObject({
        operation: 'settle',
        outcome: { kind: 'derived' },
      });
      await expect(events.observe(observer).one()).resolves.toMatchObject({
        value: 'admin',
      });
    } finally {
      await second.close();
    }
  });
});
