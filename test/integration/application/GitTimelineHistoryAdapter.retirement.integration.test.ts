import { setImmediate as nextTurn } from 'node:timers/promises';
import { describe, expect, it, vi } from 'vitest';
import Plumbing from '@git-stunts/plumbing';
import GitTimelineHistoryAdapter from '../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import { createTestRepo } from '../api/helpers/setup.ts';
import ClosedStdinSchedule from './ClosedStdinSchedule.ts';

const DEFAULT_SESSION_IDLE_MS = 1000;

// Medium: real Git in an owned repository; only the idle clock is virtual.
// Oracle: after the owned Git process closes, history close must settle even
// when stdin never emits finish. A pending retirement must not strand close.
describe('Git history session retirement', () => {
  it('settles storage closure after an idle reader closes stdin without finish', async () => {
    const repository = await createTestRepo('idle-reader-close');
    let history: GitTimelineHistoryAdapter | null = null;
    const schedule = new ClosedStdinSchedule();
    const content = 'idle reader lifecycle';
    const oid = await repository.plumbing.execute({
      args: ['hash-object', '-w', '--stdin'], input: content,
    });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    schedule.install();
    try {
      const plumbing = await Plumbing.createDefault({ cwd: repository.tempDir });
      history = new GitTimelineHistoryAdapter({ plumbing });
      expect(new TextDecoder().decode(await history.readBlob(oid))).toBe(content);
      expect(schedule.witnesses).toBe(1);
      vi.advanceTimersByTime(DEFAULT_SESSION_IDLE_MS);
      expect(await schedule.closed).toBe(0);
      expect(schedule.closedWithoutFinish).toBe(1);
      const outcome = { settled: false };
      const closing = history.close().then(() => { outcome.settled = true; });
      await nextTurn();

      expect(outcome.settled, 'history close must settle after idle reader exit').toBe(true);
      await closing;
    } finally {
      schedule.release();
      vi.useRealTimers();
      await history?.close();
      await repository.cleanup();
    }
  });
});
