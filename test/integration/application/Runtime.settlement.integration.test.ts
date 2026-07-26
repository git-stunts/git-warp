import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Runtime } from '../../../index.ts';
import Intent from '../../../src/domain/api/Intent.ts';
import { createObserver } from '../../../src/domain/api/ObserverRuntime.ts';
import LegacyReading from '../../../src/domain/api/Reading.ts';
import { createTestRepo } from '../api/helpers/setup.ts';

const roleObserver = createObserver<string>(
  'users.role-of',
  LegacyReading.property({ subject: 'user:alice', key: 'role' }),
  (value) => {
    if (typeof value !== 'string') {
      throw new TypeError('users.role-of expected a string');
    }
    return value;
  },
);

describe('Runtime settlement plans', () => {
  let repository: Awaited<ReturnType<typeof createTestRepo>>;

  beforeEach(async () => {
    repository = await createTestRepo('runtime-settlement');
  });

  afterEach(async () => {
    await repository.cleanup();
  });

  it('previews without mutation and settles only its immutable issued plan', async () => {
    const runtime = await Runtime.open({
      at: repository.tempDir,
      writer: 'agent-1',
    });
    const foreign = await Runtime.open({
      at: repository.tempDir,
      writer: 'agent-2',
    });
    try {
      const events = await runtime.lane('events');
      await events.write(Intent.addNode({ subject: 'user:alice' }));
      await events.write(Intent.setProperty({
        subject: 'user:alice',
        key: 'role',
        value: 'member',
      }));
      const draft = await runtime.fork(events, { name: 'try-admin-role' });
      await draft.write(Intent.setProperty({
        subject: 'user:alice',
        key: 'role',
        value: 'admin',
      }));

      const preview = await runtime.previewSettlement({
        source: draft,
        target: events,
      });

      expect(preview).toMatchObject({
        operation: 'preview-settlement',
        outcome: { kind: 'derived' },
        source: { kind: 'strand', name: 'try-admin-role' },
        target: { kind: 'worldline', name: 'events' },
      });
      expect(Object.isFrozen(preview)).toBe(true);
      expect(Object.isFrozen(preview.plan)).toBe(true);
      expect(Object.isFrozen(preview.evidence)).toBe(true);
      await expect(events.observe(roleObserver).one()).resolves.toMatchObject({
        value: 'member',
      });

      const lookalike = { ...preview.plan };
      await expect(runtime.settle(lookalike)).rejects.toMatchObject({
        code: 'E_RUNTIME_SETTLEMENT_PLAN',
      });
      await expect(foreign.settle(preview.plan)).rejects.toMatchObject({
        code: 'E_RUNTIME_SETTLEMENT_FOREIGN_PLAN',
      });

      const receipt = await runtime.settle(preview.plan);
      expect(receipt).toMatchObject({
        operation: 'settle',
        outcome: { kind: 'derived' },
        plan: preview.plan,
        repairHints: [],
      });
      expect(Object.isFrozen(receipt)).toBe(true);
      await expect(events.observe(roleObserver).one()).resolves.toMatchObject({
        value: 'admin',
      });
    } finally {
      await foreign.close();
      await runtime.close();
    }
  });

  it('rejects a plan whose target frontier changed after preview', async () => {
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
      const draft = await runtime.fork(events, { name: 'try-admin-role' });
      await draft.write(Intent.setProperty({
        subject: 'user:alice',
        key: 'role',
        value: 'admin',
      }));
      const preview = await runtime.previewSettlement({
        source: draft,
        target: events,
      });

      await events.write(Intent.setProperty({
        subject: 'user:alice',
        key: 'role',
        value: 'owner',
      }));
      const receipt = await runtime.settle(preview.plan);

      expect(receipt).toMatchObject({
        operation: 'settle',
        reason: 'git-warp.settlement-stale-basis',
        repairHints: [{ code: 'repreview-settlement' }],
      });
      expect(receipt.outcome.kind).toBe('obstruction');
      if (receipt.outcome.kind !== 'obstruction') {
        throw new Error('expected stale settlement obstruction');
      }
      expect(receipt.outcome.witness.reason.family).toBe('stale-basis');
      await expect(events.observe(roleObserver).one()).resolves.toMatchObject({
        value: 'owner',
      });
    } finally {
      await runtime.close();
    }
  });

  it('serializes concurrent attempts so one settlement becomes stale', async () => {
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
      const draft = await runtime.fork(events, { name: 'try-admin-role' });
      await draft.write(Intent.setProperty({
        subject: 'user:alice',
        key: 'role',
        value: 'admin',
      }));
      const preview = await runtime.previewSettlement({
        source: draft,
        target: events,
      });

      const receipts = await Promise.all([
        runtime.settle(preview.plan),
        runtime.settle(preview.plan),
      ]);

      expect(receipts.map(({ outcome }) => outcome.kind).sort()).toEqual([
        'derived',
        'obstruction',
      ]);
      const obstruction = receipts.find(
        ({ outcome }) => outcome.kind === 'obstruction',
      );
      expect(obstruction?.reason).toBe('git-warp.settlement-stale-basis');
      await expect(events.observe(roleObserver).one()).resolves.toMatchObject({
        value: 'admin',
      });
    } finally {
      await runtime.close();
    }
  });

  it('keeps a pre-preview common-basis divergence non-executable', async () => {
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
      const draft = await runtime.fork(events, { name: 'try-admin-role' });
      await draft.write(Intent.setProperty({
        subject: 'user:alice',
        key: 'role',
        value: 'admin',
      }));
      await events.write(Intent.setProperty({
        subject: 'user:alice',
        key: 'role',
        value: 'owner',
      }));

      const preview = await runtime.previewSettlement({
        source: draft,
        target: events,
      });
      expect(preview.outcome.kind).toBe('obstruction');
      if (preview.outcome.kind !== 'obstruction') {
        throw new Error('expected common-basis obstruction');
      }
      expect(preview.outcome.witness.reason).toMatchObject({
        family: 'unsupported-contract',
        code: 'git-warp.settlement-common-basis-required',
      });

      const receipt = await runtime.settle(preview.plan);
      expect(receipt.outcome).toBe(preview.outcome);
      await expect(events.observe(roleObserver).one()).resolves.toMatchObject({
        value: 'owner',
      });
    } finally {
      await runtime.close();
    }
  });
});
