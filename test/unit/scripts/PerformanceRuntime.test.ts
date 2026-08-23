import { describe, expect, it } from 'vitest';
import type { CollectableStream } from '../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import {
  CountingPlumbing,
  type PerformanceGitPlumbing,
} from '../../../scripts/performance/PerformanceRuntime.ts';

class RecordingSessionPlumbing implements PerformanceGitPlumbing {
  readonly emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  readonly opened: string[] = [];
  readonly sessions = Object.freeze({
    catFile: Object.freeze({ protocol: 'cat-file' }),
    fastImport: Object.freeze({ protocol: 'fast-import' }),
    mktree: Object.freeze({ protocol: 'mktree' }),
  });

  async execute(): Promise<string> {
    throw new Error('execute is outside this session delegation test');
  }

  async executeStream(): Promise<CollectableStream> {
    throw new Error('executeStream is outside this session delegation test');
  }

  async openCatFileSession(): Promise<unknown> {
    this.opened.push('cat-file');
    return this.sessions.catFile;
  }

  async openFastImportSession(): Promise<unknown> {
    this.opened.push('fast-import');
    return this.sessions.fastImport;
  }

  async openMktreeSession(): Promise<unknown> {
    this.opened.push('mktree');
    return this.sessions.mktree;
  }
}

describe('performance plumbing session fidelity', () => {
  it('delegates persistent protocols and counts one process start per session', async () => {
    const delegate = new RecordingSessionPlumbing();
    const plumbing = new CountingPlumbing(delegate);

    await expect(
      Promise.all([
        plumbing.openCatFileSession(),
        plumbing.openFastImportSession(),
        plumbing.openMktreeSession(),
      ])
    ).resolves.toEqual([
      delegate.sessions.catFile,
      delegate.sessions.fastImport,
      delegate.sessions.mktree,
    ]);

    expect(delegate.opened).toEqual(['cat-file', 'fast-import', 'mktree']);
    expect(plumbing.commandCount).toBe(3);
    expect(plumbing.commandHistogram()).toEqual({
      'session:cat-file': 1,
      'session:fast-import': 1,
      'session:mktree': 1,
    });
  });
});
