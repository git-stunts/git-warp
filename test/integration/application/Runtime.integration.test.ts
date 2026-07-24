import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Runtime } from '../../../index.ts';
import Intent from '../../../src/domain/api/Intent.ts';
import { createGitRepo, type GitRepoFixture } from '../../helpers/WarpGraphTestRepositories.ts';

describe('Runtime public composition', () => {
  let repository: GitRepoFixture;

  beforeEach(async () => {
    repository = await createGitRepo('public-runtime');
  });

  afterEach(async () => {
    await repository.cleanup();
  });

  it('owns a real repository and writes through a Lane', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'agent-1' });
    try {
      const lane = await runtime.lane('events');

      const receipt = await lane.write(Intent.addNode({ subject: 'user:alice' }));

      expect(receipt.outcome.kind).toBe('derived');
      expect(receipt.lane).toBe('events');
      expect(lane.kind).toBe('worldline');
      expect(await repository.persistence.listRefs('refs/warp/events/writers/')).toEqual([
        'refs/warp/events/writers/agent-1',
      ]);
    } finally {
      await runtime.close();
    }
  });

  it('closes idempotently and stops new local work', async () => {
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'agent-1' });

    const firstClose = runtime.close();
    const secondClose = runtime.close();

    expect(firstClose).toBe(secondClose);
    await firstClose;
    await expect(runtime.lane('events')).rejects.toMatchObject({ code: 'E_RUNTIME_CLOSED' });
  });
});
