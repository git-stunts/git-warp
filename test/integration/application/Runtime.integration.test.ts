import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { Runtime } from '../../../index.ts';
import { createEntityAdmissionInventoryObserver, intent } from '../../../advanced.ts';
import { admittedSubject, writeThroughWarp } from '../../helpers/WarpSeed.ts';
import { createGitRepo, type GitRepoFixture } from '../../helpers/WarpGraphTestRepositories.ts';

describe('Runtime public composition', () => {
  let repository: GitRepoFixture;

  beforeEach(async () => {
    repository = await createGitRepo('public-runtime');
  });

  afterEach(async () => {
    await repository.cleanup();
  });

  it('owns a real repository and reads what Warp wrote through a Lane', async () => {
    const written = await writeThroughWarp(repository.tempDir, 'events', 'agent-1',
      intent.entity.addAuto({ namespace: 'user', properties: { role: 'admin' } }));
    const runtime = await Runtime.open({ at: repository.tempDir, writer: 'reader' });
    try {
      const lane = await runtime.lane('events');
      const observation = lane.observe(createEntityAdmissionInventoryObserver('users.inventory'));
      const subjects: string[] = [];
      for await (const reading of observation) {
        subjects.push(reading.value.representation.subject);
      }

      expect(subjects).toEqual([admittedSubject(written)]);
      expect((await observation.receipt).status).toBe('completed');
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
