import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { intent, openWarp } from '../../../index.ts';
import { GitStorage } from '../../../storage.ts';
import { createGitRepo, type GitRepoFixture } from '../../helpers/WarpGraphTestRepositories.ts';

describe('GitStorage public composition', () => {
  let repository: GitRepoFixture;

  beforeEach(async () => {
    repository = await createGitRepo('public-storage');
  });

  afterEach(async () => {
    await repository.cleanup();
  });

  it('opens a real repository and writes through the storage-neutral API', async () => {
    const storage = await GitStorage.open({ cwd: repository.tempDir });
    const warp = await openWarp({ storage, writer: 'agent-1' });
    const timeline = await warp.timeline('events');

    const receipt = await timeline.write(intent.node.add({ subject: 'user:alice' }));

    expect(receipt.outcome).toBe('accepted');
    expect(receipt.timeline).toBe('events');
    expect(await repository.persistence.listRefs('refs/warp/events/writers/')).toEqual([
      'refs/warp/events/writers/agent-1',
    ]);
  });
});
