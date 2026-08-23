import { describe, expect, it } from 'vitest';
import type { CollectableStream } from '../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import {
  CountingPlumbing,
  type PerformanceGitPlumbing,
} from '../../../scripts/performance/PerformanceRuntime.ts';
import RecordingMaterializationWorkspace
  from '../../../scripts/performance/RecordingMaterializationWorkspace.ts';
import MaterializationWorkspacePort
  from '../../../src/ports/MaterializationWorkspacePort.ts';
import type { StagePagesOptions }
  from '../../../src/ports/ArtifactStagingPort.ts';

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

  it('preserves bounded page staging through the recording workspace', async () => {
    const sources = Object.freeze([
      Uint8Array.of(1, 2),
      Uint8Array.of(3, 4),
    ]);
    const options: StagePagesOptions = Object.freeze({
      maxBytes: 16,
      maxBatchBytes: 32,
      maxBatchPages: 2,
    });
    const handles = Object.freeze(['page:sha1:one', 'page:sha1:two']);
    const calls: Array<readonly [readonly Uint8Array[], StagePagesOptions]> = [];
    const delegate: MaterializationWorkspacePort = {
      checkpoint: async () => null,
      promote: async () => {
        throw new Error('promote is outside this page-batch delegation test');
      },
      release: async () => undefined,
      stageOrderedBundle: async () => {
        throw new Error('bundle staging is outside this page-batch delegation test');
      },
      stagePage: async () => {
        throw new Error('single-page staging is outside this page-batch delegation test');
      },
      stagePages: async (pageSources, pageOptions) => {
        calls.push([pageSources, pageOptions]);
        return handles;
      },
    };
    const workspace = new RecordingMaterializationWorkspace(
      delegate,
      delegate.promote,
    );

    await expect(workspace.stagePages(sources, options)).resolves.toBe(handles);
    expect(calls).toEqual([[sources, options]]);
  });
});
