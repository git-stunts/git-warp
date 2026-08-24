import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Plumbing from '@git-stunts/plumbing';
import { describe, expect, it } from 'vitest';
import type { CollectableStream } from '../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import {
  CountingPlumbing,
} from '../../../scripts/performance/PerformanceRuntime.ts';
import type {
  PerformanceCatFileSession,
  PerformanceFastImportSession,
  PerformanceGitPlumbing,
  PerformanceMktreeSession,
  PerformanceUpdateRefSession,
} from '../../../scripts/performance/PerformanceGitPlumbing.ts';
import RecordingMaterializationWorkspace
  from '../../../scripts/performance/RecordingMaterializationWorkspace.ts';
import BundleHandle from '../../../src/domain/storage/BundleHandle.ts';
import MaterializationWorkspacePort
  from '../../../src/ports/MaterializationWorkspacePort.ts';
import type {
  StagedBundleMember,
  StageOrderedBundleRequest,
  StageOrderedBundlesOptions,
  StagePagesOptions,
}
  from '../../../src/ports/ArtifactStagingPort.ts';

class RecordingSessionPlumbing implements PerformanceGitPlumbing {
  readonly emptyTree = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';
  readonly opened: string[] = [];
  readonly sessions: Readonly<{
    catFile: PerformanceCatFileSession;
    fastImport: PerformanceFastImportSession;
    mktree: PerformanceMktreeSession;
    updateRef: PerformanceUpdateRefSession;
  }> = Object.freeze({
    catFile: Object.freeze({
      close: outsideSessionDelegation,
      info: outsideSessionDelegation,
      infoMany: outsideSessionDelegation,
      read: outsideSessionDelegation,
      readMany: outsideSessionDelegation,
      terminate: outsideSessionDelegation,
    }),
    fastImport: Object.freeze({
      abort: outsideSessionDelegation,
      checkpoint: outsideSessionDelegation,
      close: outsideSessionDelegation,
      writeBlob: outsideSessionDelegation,
      writeBlobs: outsideSessionDelegation,
    }),
    mktree: Object.freeze({
      close: outsideSessionDelegation,
      terminate: outsideSessionDelegation,
      write: outsideSessionDelegation,
      writeMany: outsideSessionDelegation,
    }),
    updateRef: Object.freeze({
      close: outsideSessionDelegation,
      terminate: outsideSessionDelegation,
      update: outsideSessionDelegation,
    }),
  });

  async execute(): Promise<string> {
    throw new Error('execute is outside this session delegation test');
  }

  async executeStream(): Promise<CollectableStream> {
    throw new Error('executeStream is outside this session delegation test');
  }

  async openCatFileSession(): Promise<PerformanceCatFileSession> {
    this.opened.push('cat-file');
    return this.sessions.catFile;
  }

  async openFastImportSession(): Promise<PerformanceFastImportSession> {
    this.opened.push('fast-import');
    return this.sessions.fastImport;
  }

  async openMktreeSession(): Promise<PerformanceMktreeSession> {
    this.opened.push('mktree');
    return this.sessions.mktree;
  }

  async openUpdateRefSession(): Promise<PerformanceUpdateRefSession> {
    this.opened.push('update-ref');
    return this.sessions.updateRef;
  }
}

async function outsideSessionDelegation(): Promise<never> {
  throw new Error('session operation is outside this delegation test');
}

describe('performance plumbing session fidelity', () => {
  it('uses a plumbing release with persistent update-ref sessions', async () => {
    const repositoryPath = await mkdtemp(
      join(tmpdir(), 'git-warp-performance-plumbing-'),
    );
    try {
      const plumbing = await Plumbing.createDefault({ cwd: repositoryPath });
      await plumbing.execute({ args: ['init'] });

      const session = await plumbing.openUpdateRefSession();
      await session.close();
    } finally {
      await rm(repositoryPath, { recursive: true, force: true });
    }
  });

  it('delegates persistent protocols and counts one process start per session', async () => {
    const delegate = new RecordingSessionPlumbing();
    const plumbing = new CountingPlumbing(delegate);

    await expect(
      Promise.all([
        plumbing.openCatFileSession(),
        plumbing.openFastImportSession(),
        plumbing.openMktreeSession(),
        plumbing.openUpdateRefSession(),
      ])
    ).resolves.toEqual([
      delegate.sessions.catFile,
      delegate.sessions.fastImport,
      delegate.sessions.mktree,
      delegate.sessions.updateRef,
    ]);

    expect(delegate.opened).toEqual(['cat-file', 'fast-import', 'mktree', 'update-ref']);
    expect(plumbing.commandCount).toBe(4);
    expect(plumbing.commandHistogram()).toEqual({
      'session:cat-file': 1,
      'session:fast-import': 1,
      'session:mktree': 1,
      'session:update-ref': 1,
    });
  });

  it('preserves bounded page and bundle staging through the recording workspace', async () => {
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
    const pageCalls: Array<readonly [readonly Uint8Array[], StagePagesOptions]> = [];
    const bundleMembers: readonly StagedBundleMember[] = Object.freeze([
      ['leaf/data', 'page:sha1:one'],
    ]);
    const bundleRequests: readonly StageOrderedBundleRequest[] = Object.freeze([
      Object.freeze({ members: bundleMembers }),
    ]);
    const bundleOptions: StageOrderedBundlesOptions = Object.freeze({
      maxBatchBundles: 64,
      maxBatchMembers: 8_192,
      maxBatchObjects: 256,
      maxBatchBytes: 64 * 1024 * 1024,
    });
    const bundleHandles = Object.freeze([new BundleHandle('test:batch-bundle')]);
    const bundleCalls: Array<readonly [
      readonly StageOrderedBundleRequest[],
      StageOrderedBundlesOptions,
    ]> = [];
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
        pageCalls.push([pageSources, pageOptions]);
        return handles;
      },
      stageOrderedBundles: async (requests, options) => {
        bundleCalls.push([requests, options]);
        return bundleHandles;
      },
    };
    const workspace = new RecordingMaterializationWorkspace(
      delegate,
      delegate.promote,
    );

    await expect(workspace.stagePages(sources, options)).resolves.toBe(handles);
    expect(pageCalls).toEqual([[sources, options]]);
    const stageOrderedBundles = workspace.stageOrderedBundles;
    if (stageOrderedBundles === undefined) {
      throw new Error('Recording workspace omitted bounded bundle staging');
    }
    await expect(
      stageOrderedBundles.call(workspace, bundleRequests, bundleOptions)
    ).resolves.toBe(bundleHandles);
    expect(bundleCalls).toEqual([[bundleRequests, bundleOptions]]);
  });
});
