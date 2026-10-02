import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Runtime } from '../../../index.ts';
import { intent } from '../../../advanced.ts';
import { createGitRepo, type GitRepoFixture } from '../../helpers/WarpGraphTestRepositories.ts';

function signal() {
  let release = () => {};
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

describe('Runtime content staging', () => {
  let repository: GitRepoFixture;
  beforeEach(async () => { repository = await createGitRepo('content-staging'); });
  afterEach(async () => { await repository.cleanup(); });

  it('stages bytes and plaintext metadata without publishing a graph patch', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    try {
      const lane = await runtime.lane('documents');
      const content = await lane.stageContent('hello', { mime: 'text/plain' });
      expect(content.id.length).toBeGreaterThan(0);
      expect(content.size).toBe(5);
      expect(content.mime).toBe('text/plain');
      expect(Object.isFrozen(content)).toBe(true);
      expect(await repository.persistence.listRefs('refs/warp/documents/writers/')).toEqual([]);
    } finally { await runtime.close(); }
  });

  it('refuses a failed stream without publishing a graph patch', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    try {
      const lane = await runtime.lane('documents');
      async function* bytes() { yield new Uint8Array([1, 2, 3]); }
      await expect(lane.stageContent(bytes(), { size: 2 }))
        .rejects.toMatchObject({ code: 'E_ASSET_SIZE_MISMATCH' });
      expect(await repository.persistence.listRefs('refs/warp/documents/writers/')).toEqual([]);
    } finally { await runtime.close(); }
  });

  it('preserves a producer failure and finalizes it without publishing', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    const original = new Error('producer refused');
    let finalized = false;
    try {
      const lane = await runtime.lane('documents');
      async function* bytes() {
        try { yield new Uint8Array([1]); throw original; } finally { finalized = true; }
      }
      await expect(lane.stageContent(bytes())).rejects.toBe(original);
      expect(finalized).toBe(true);
      expect(await repository.persistence.listRefs('refs/warp/documents/writers/')).toEqual([]);
    } finally { await runtime.close(); }
  });

  it('keeps storage open until staging finishes and rejects work after close begins', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    const started = signal();
    const proceed = signal();
    let finished = false;
    try {
      const lane = await runtime.lane('documents');
      async function* bytes() {
        try { started.release(); await proceed.promise; yield new Uint8Array([1, 2, 3]); }
        finally { finished = true; }
      }
      const staging = lane.stageContent(bytes());
      await started.promise;
      let closed = false;
      const closing = runtime.close().then(() => { closed = true; });
      await expect(lane.stageContent('later')).rejects.toMatchObject({ code: 'E_RUNTIME_CLOSED' });
      expect(closed).toBe(false);
      proceed.release();
      expect((await staging).size).toBe(3);
      await closing;
      expect(finished).toBe(true);
      expect(closed).toBe(true);
    } finally { proceed.release(); await runtime.close(); }
  });

  it('provides the same staging capability to forked and reopened strands', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'writer-a' });
    try {
      const lane = await runtime.lane('documents');
      await lane.write(intent.node.add({ subject: 'document' }));
      const strand = await runtime.fork(lane, { name: 'draft' });
      expect((await strand.stageContent('draft bytes')).size).toBe(11);
      const reopened = await runtime.strand(lane, { name: 'draft' });
      expect((await reopened.stageContent(new Uint8Array([42]))).size).toBe(1);
    } finally { await runtime.close(); }
  });
});
