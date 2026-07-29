import { afterEach, describe, expect, it, vi } from 'vitest';

import type { V18MigrationProgress } from '../../../scripts/v18-to-v19/V18MigrationProgress.ts';
import V18MigrationProgressCoalescer from '../../../scripts/v18-to-v19/V18MigrationProgressCoalescer.ts';

describe('v18 migration progress', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the first item immediately and the newest item in each window', () => {
    vi.useFakeTimers();
    const rendered: V18MigrationProgress[] = [];
    const coalescer = new V18MigrationProgressCoalescer((progress) => rendered.push(progress), 100);

    coalescer.report(progress(0));
    coalescer.report(progress(1));
    coalescer.report(progress(2));

    expect(rendered.map((event) => event.completed)).toEqual([0]);
    vi.advanceTimersByTime(100);
    expect(rendered.map((event) => event.completed)).toEqual([0, 2]);
  });

  it('flushes the newest item and cancels scheduled rendering', () => {
    vi.useFakeTimers();
    const rendered: V18MigrationProgress[] = [];
    const coalescer = new V18MigrationProgressCoalescer((progress) => rendered.push(progress), 100);

    coalescer.report(progress(0));
    coalescer.report(progress(1));
    coalescer.flush();
    vi.advanceTimersByTime(100);

    expect(rendered.map((event) => event.completed)).toEqual([0, 1]);
  });

  it('does not let terminal rendering failure replace the migration outcome', () => {
    vi.useFakeTimers();
    const reporter = vi.fn((update: V18MigrationProgress) => {
      if (update.completed === 1) {
        throw new Error('terminal renderer failed');
      }
    });
    const coalescer = new V18MigrationProgressCoalescer(reporter, 100);

    coalescer.report(progress(0));
    coalescer.report(progress(1));

    expect(() => coalescer.flushBestEffort()).not.toThrow();
    vi.advanceTimersByTime(100);
    expect(reporter).toHaveBeenCalledTimes(2);
  });

  it('contains rendering failures from scheduled progress delivery', () => {
    vi.useFakeTimers();
    const reporter = vi.fn((update: V18MigrationProgress) => {
      if (update.completed === 1) {
        throw new Error('scheduled renderer failed');
      }
    });
    const coalescer = new V18MigrationProgressCoalescer(reporter, 100);

    coalescer.report(progress(0));
    coalescer.report(progress(1));

    expect(() => vi.advanceTimersByTime(100)).not.toThrow();
    vi.advanceTimersByTime(100);
    expect(reporter).toHaveBeenCalledTimes(2);
  });

  it('flushes the previous writer before rendering the next writer', () => {
    vi.useFakeTimers();
    const rendered: V18MigrationProgress[] = [];
    const coalescer = new V18MigrationProgressCoalescer((progress) => rendered.push(progress), 100);

    coalescer.report(progress(0));
    coalescer.report(progress(1));
    coalescer.report(Object.freeze({ ...progress(0), writer: 'remote' }));

    expect(rendered.map((event) => [event.writer, event.completed])).toEqual([
      ['local', 0],
      ['local', 1],
      ['remote', 0],
    ]);
  });

  it('renders every named step while coalescing repeated item updates', () => {
    vi.useFakeTimers();
    const rendered: V18MigrationProgress[] = [];
    const coalescer = new V18MigrationProgressCoalescer((update) => rendered.push(update), 100);

    coalescer.report(progress(0));
    coalescer.report(progress(1));
    coalescer.report(Object.freeze({
      completed: 0,
      message: 'building current bounded checkpoint indexes',
      phase: 'scratch',
      total: 2,
    }));

    expect(rendered.map((event) => [event.message, event.completed])).toEqual([
      ['translating writer chain', 0],
      ['translating writer chain', 1],
      ['building current bounded checkpoint indexes', 0],
    ]);
  });

  it('rejects a non-positive render interval', () => {
    expect(() => new V18MigrationProgressCoalescer(() => undefined, 0)).toThrow(
      'migration progress render interval must be a positive integer'
    );
  });
});

function progress(completed: number): V18MigrationProgress {
  return Object.freeze({
    completed,
    message: 'translating writer chain',
    phase: 'rewrite',
    total: 2,
    writer: 'local',
  });
}
